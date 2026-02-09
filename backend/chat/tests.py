import json

from django.test import Client, TestCase


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
