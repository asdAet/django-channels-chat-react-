"""Содержит тесты модуля `test_forms` подсистемы `users`."""


import io
from unittest.mock import patch

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from users.forms import ProfileUpdateForm, UserUpdateForm
from users.models import MAX_PROFILE_IMAGE_SIDE

User = get_user_model()


class UserUpdateFormTests(TestCase):
    """Группирует тестовые сценарии класса `UserUpdateFormTests`."""
    def test_allows_same_username_for_current_user(self):
        """Проверяет сценарий `test_allows_same_username_for_current_user`."""
        user = User.objects.create_user(username='user1', password='pass12345')
        form = UserUpdateForm(data={'username': 'user1', 'email': ''}, instance=user)
        self.assertTrue(form.is_valid())

    def test_rejects_duplicate_username(self):
        """Проверяет сценарий `test_rejects_duplicate_username`."""
        User.objects.create_user(username='user1', password='pass12345')
        user2 = User.objects.create_user(username='user2', password='pass12345')
        form = UserUpdateForm(data={'username': 'user1', 'email': ''}, instance=user2)
        self.assertFalse(form.is_valid())
        self.assertIn('username', form.errors)

    def test_username_length_boundary(self):
        """????????? ????????? ???????? ????? username ? ????? ??????????."""
        user = User.objects.create_user(username='base_user', password='pass12345')

        valid_form = UserUpdateForm(data={'username': 'x' * 30, 'email': ''}, instance=user)
        self.assertTrue(valid_form.is_valid())

        invalid_form = UserUpdateForm(data={'username': 'x' * 31, 'email': ''}, instance=user)
        self.assertFalse(invalid_form.is_valid())
        self.assertIn('username', invalid_form.errors)

    def test_rejects_duplicate_email_case_insensitive(self):
        """Проверяет сценарий `test_rejects_duplicate_email_case_insensitive`."""
        User.objects.create_user(username='user1', password='pass12345', email='mail@example.com')
        user2 = User.objects.create_user(username='user2', password='pass12345', email='other@example.com')
        form = UserUpdateForm(data={'username': 'user2', 'email': 'MAIL@example.com'}, instance=user2)
        self.assertFalse(form.is_valid())
        self.assertIn('email', form.errors)


class ProfileUpdateFormTests(TestCase):
    """Группирует тестовые сценарии класса `ProfileUpdateFormTests`."""
    @staticmethod
    def _image_upload(size=(20, 20)) -> SimpleUploadedFile:
        """Создает тестовую PNG-картинку заданного размера."""
        image = Image.new("RGB", size, (10, 20, 30))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        return SimpleUploadedFile("avatar.png", buffer.read(), content_type="image/png")

    def test_clean_bio_strips_html_tags(self):
        """Проверяет сценарий `test_clean_bio_strips_html_tags`."""
        user = User.objects.create_user(username='bio_user', password='pass12345')
        profile = user.profile
        form = ProfileUpdateForm(
            data={'bio': '<b>Hello</b> <script>alert(1)</script>'},
            instance=profile,
        )
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data['bio'], 'Hello alert(1)')

    def test_clean_image_rejects_too_large_dimensions(self):
        """Отклоняет изображение, если хотя бы одна сторона превышает лимит."""
        user = User.objects.create_user(username="image_too_large", password="pass12345")
        form = ProfileUpdateForm(
            data={"bio": "ok"},
            files={"image": self._image_upload(size=(MAX_PROFILE_IMAGE_SIDE + 1, 100))},
            instance=user.profile,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("image", form.errors)

    def test_clean_image_rejects_decompression_bomb(self):
        """Отклоняет изображение при срабатывании защиты PIL от bomb-архивов."""
        user = User.objects.create_user(username="bomb_image", password="pass12345")
        with patch("users.forms.Image.open", side_effect=Image.DecompressionBombError):
            form = ProfileUpdateForm(
                data={"bio": "ok"},
                files={"image": self._image_upload(size=(20, 20))},
                instance=user.profile,
            )
            self.assertFalse(form.is_valid())
            self.assertIn("image", form.errors)
