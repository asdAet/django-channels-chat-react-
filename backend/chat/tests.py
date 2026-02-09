import json

from django.test import Client, SimpleTestCase, TestCase, override_settings

from .utils import build_profile_url


class ApiTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def _csrf(self):
        response = self.client.get("/api/auth/csrf/")
        return response.cookies["csrftoken"].value

    def test_public_room(self):
        response = self.client.get("/api/chat/public-room/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("slug"), "public")

    def test_private_room_requires_auth(self):
        response = self.client.get("/api/chat/rooms/private123/")
        self.assertEqual(response.status_code, 401)

    def test_register_and_login(self):
        csrf = self._csrf()
        register_payload = {
            "username": "testuser",
            "password1": "pass12345",
            "password2": "pass12345",
        }
        response = self.client.post(
            "/api/auth/register/",
            data=json.dumps(register_payload),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertIn(response.status_code, [200, 201])

        csrf = self._csrf()
        login_payload = {"username": "testuser", "password": "pass12345"}
        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps(login_payload),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 200)


class BuildProfileUrlTests(SimpleTestCase):
    def _scope(self, headers=None, server=None, scheme="ws"):
        return {
            "headers": headers or [],
            "server": server,
            "scheme": scheme,
        }

    @override_settings(MEDIA_URL="/media/")
    def test_prefers_forwarded_headers(self):
        scope = self._scope(
            headers=[
                (b"x-forwarded-host", b"80.253.249.107"),
                (b"x-forwarded-proto", b"http"),
                (b"host", b"172.18.0.4:8000"),
            ],
            server=("172.18.0.4", 8000),
            scheme="ws",
        )
        url = build_profile_url(scope, "profile_pics/a.jpg")
        self.assertEqual(url, "http://80.253.249.107/media/profile_pics/a.jpg")

    @override_settings(MEDIA_URL="/media/")
    def test_falls_back_to_server(self):
        scope = self._scope(headers=[], server=("172.18.0.4", 8000), scheme="ws")
        url = build_profile_url(scope, "profile_pics/a.jpg")
        self.assertEqual(url, "http://172.18.0.4:8000/media/profile_pics/a.jpg")

    def test_keeps_absolute_url(self):
        scope = self._scope()
        url = build_profile_url(scope, "https://cdn.example.com/a.jpg")
        self.assertEqual(url, "https://cdn.example.com/a.jpg")
