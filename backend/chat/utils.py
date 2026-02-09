from django.conf import settings


def build_profile_url(scope, image_name: str | None) -> str | None:
    if not image_name:
        return None

    if image_name.startswith("http://") or image_name.startswith("https://"):
        return image_name

    media_url = settings.MEDIA_URL or "/media/"
    if not media_url.startswith("/"):
        media_url = f"/{media_url}"
    if not media_url.endswith("/"):
        media_url = f"{media_url}/"

    path = image_name
    if not path.startswith("/"):
        path = f"{media_url}{image_name}"

    server = scope.get("server") or (None, None)
    host_val, port_val = server

    if not host_val:
        for header, value in scope.get("headers", []):
            if header == b"host":
                host_val = value.decode("utf-8")
                break

    if host_val:
        if ":" not in host_val and port_val:
            host_val = f"{host_val}:{port_val}"
        scheme = "https" if scope.get("scheme") == "wss" else "http"
        return f"{scheme}://{host_val}{path}"

    return path
