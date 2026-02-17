"""Содержит тесты модуля `test_api_profile` подсистемы `users`."""


import io
from urllib.parse import parse_qs, urlparse

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.test.utils import override_settings

from chat import utils
from users.models import MAX_PROFILE_IMAGE_SIDE

User = get_user_model()


class ProfileApiTests(TestCase):
    """Группирует тестовые сценарии класса `ProfileApiTests`."""
    def setUp(self):
        """Проверяет сценарий `setUp`."""
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(
            username='profile_user',
            password='pass12345',
            email='profile@example.com',
        )
        self.other = User.objects.create_user(
            username='other_user',
            password='pass12345',
            email='other@example.com',
        )

    def _csrf(self) -> str:
        """Проверяет сценарий `_csrf`."""
        response = self.client.get('/api/auth/csrf/')
        return response.cookies['csrftoken'].value

    @staticmethod
    def _image_upload(filename: str = 'avatar.png', size=(20, 20)) -> SimpleUploadedFile:
        """Проверяет сценарий `_image_upload`."""
        image = Image.new('RGB', size, (30, 60, 90))
        buff = io.BytesIO()
        image.save(buff, format='PNG')
        buff.seek(0)
        return SimpleUploadedFile(filename, buff.read(), content_type='image/png')

    def _assert_signed_profile_image(self, url: str):
        """Проверяет, что profileImage отдается через подписанный endpoint."""
        parsed = urlparse(url)
        self.assertEqual(parsed.path.split("/api/auth/media/")[0], "")
        self.assertTrue(parsed.path.startswith("/api/auth/media/"))
        query = parse_qs(parsed.query)
        self.assertIn("exp", query)
        self.assertIn("sig", query)
        media_path = parsed.path.removeprefix("/api/auth/media/")
        self.assertTrue(
            utils.is_valid_media_signature(
                media_path,
                int(query["exp"][0]),
                query["sig"][0],
            )
        )

    def test_profile_requires_auth(self):
        """Проверяет сценарий `test_profile_requires_auth`."""
        response = self.client.get('/api/auth/profile/')
        self.assertEqual(response.status_code, 401)

    def test_get_profile_authenticated(self):
        """Проверяет сценарий `test_get_profile_authenticated`."""
        self.client.force_login(self.user)
        response = self.client.get('/api/auth/profile/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()['user']
        self.assertEqual(payload['username'], self.user.username)
        self.assertEqual(payload['email'], self.user.email)
        self.assertIn('bio', payload)
        self.assertIn('lastSeen', payload)

    def test_profile_update_allows_same_username(self):
        """Проверяет сценарий `test_profile_update_allows_same_username`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.user.email,
                'bio': 'updated',
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'profile_user')
        self.assertEqual(self.user.profile.bio, 'updated')

    def test_profile_update_rejects_duplicate_username(self):
        """Проверяет сценарий `test_profile_update_rejects_duplicate_username`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.other.username,
                'email': self.user.email,
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertIn('errors', payload)
        self.assertIn('username', payload['errors'])

    def test_profile_update_rejects_long_username(self):
        """Проверяет сценарий `test_profile_update_rejects_long_username`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': 'a' * 31,
                'email': self.user.email,
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertIn('errors', payload)
        self.assertIn('username', payload['errors'])

    def test_profile_update_accepts_username_length_30(self):
        """?????????, ??? ??? ???????????? ?????? 30 ???????? ???????."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': 'c' * 30,
                'email': self.user.email,
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)

    def test_profile_update_rejects_duplicate_email(self):
        """Проверяет сценарий `test_profile_update_rejects_duplicate_email`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.other.email,
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertIn('errors', payload)
        self.assertIn('email', payload['errors'])

    def test_profile_update_sanitizes_bio(self):
        """Проверяет сценарий `test_profile_update_sanitizes_bio`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.user.email,
                'bio': '<b>Hello</b> <script>alert(1)</script>',
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.profile.bio, 'Hello alert(1)')

    def test_profile_update_image_upload(self):
        """Проверяет сценарий `test_profile_update_image_upload`."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.user.email,
                'bio': 'has image',
                'image': self._image_upload(),
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()['user']
        self._assert_signed_profile_image(payload['profileImage'])

    def test_profile_update_rejects_oversized_image(self):
        """Отклоняет загрузку аватара, если сторона больше безопасного лимита."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        response = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.user.email,
                'bio': 'has image',
                'image': self._image_upload(size=(MAX_PROFILE_IMAGE_SIDE + 1, 50)),
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.json().get("errors", {}))

    @override_settings(DEBUG=True)
    def test_signed_media_endpoint_allows_valid_and_rejects_invalid_requests(self):
        """Проверяет endpoint подписанной раздачи media."""
        self.client.force_login(self.user)
        csrf = self._csrf()
        update = self.client.post(
            '/api/auth/profile/',
            data={
                'username': self.user.username,
                'email': self.user.email,
                'bio': 'has image',
                'image': self._image_upload(),
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(update.status_code, 200)
        signed_url = update.json()['user']['profileImage']

        parsed = urlparse(signed_url)
        valid_response = self.client.get(f"{parsed.path}?{parsed.query}")
        self.assertEqual(valid_response.status_code, 200)

        query = parse_qs(parsed.query)
        tampered = f"{parsed.path}?exp={query['exp'][0]}&sig=bad"
        with self.assertLogs('security.audit', level='INFO') as captured:
            self.assertEqual(self.client.get(tampered).status_code, 403)
        self.assertTrue(any('media.signature.invalid' in line for line in captured.output))

        media_path = parsed.path.removeprefix("/api/auth/media/")
        expired_url = utils._signed_media_url_path(media_path, expires_at=1)
        self.assertEqual(self.client.get(expired_url).status_code, 403)

    def test_public_profile_hides_email(self):
        """Проверяет сценарий `test_public_profile_hides_email`."""
        response = self.client.get(f'/api/auth/users/{self.user.username}/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()['user']
        self.assertEqual(payload['username'], self.user.username)
        self.assertEqual(payload['email'], '')
        self.assertIn('lastSeen', payload)
