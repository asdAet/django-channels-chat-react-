
"""Содержит логику модуля `forms` подсистемы `users`."""


import warnings

from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.utils.html import strip_tags
from PIL import Image

from .models import MAX_PROFILE_IMAGE_PIXELS, MAX_PROFILE_IMAGE_SIDE, Profile


USERNAME_MAX_LENGTH = 13


class UserRegisterForm(UserCreationForm):
    """Инкапсулирует логику класса `UserRegisterForm`."""
    class Meta:
        """Инкапсулирует логику класса `Meta`."""
        model = User
        fields = ["username", "password1", "password2"]

    def clean_username(self):
        """Выполняет логику `clean_username` с параметрами из сигнатуры."""
        username = (self.cleaned_data.get("username") or "").strip()
        if not username:
            return username
        if len(username) > USERNAME_MAX_LENGTH:
            raise forms.ValidationError(
                f"Максимум {USERNAME_MAX_LENGTH} символов."
            )
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError("Имя пользователя уже занято")
        return username


class UserUpdateForm(forms.ModelForm):
    """Инкапсулирует логику класса `UserUpdateForm`."""
    email = forms.EmailField(required=False)

    class Meta:
        """Инкапсулирует логику класса `Meta`."""
        model = User
        fields = ["username", "email"]

    def clean_username(self):
        """Выполняет логику `clean_username` с параметрами из сигнатуры."""
        username = self.cleaned_data.get("username", "").strip()
        if not username:
            return username
        if len(username) > USERNAME_MAX_LENGTH:
            raise forms.ValidationError(
                f"Максимум {USERNAME_MAX_LENGTH} символов."
            )
        qs = User.objects.filter(username=username)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("Имя пользователя уже занято")
        return username

    def clean_email(self):
        """Выполняет логику `clean_email` с параметрами из сигнатуры."""
        email = (self.cleaned_data.get("email") or "").strip()
        if not email:
            return ""
        qs = User.objects.filter(email__iexact=email)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise forms.ValidationError("Email уже используется")
        return email


class ProfileUpdateForm(forms.ModelForm):
    """Инкапсулирует логику класса `ProfileUpdateForm`."""
    class Meta:
        """Инкапсулирует логику класса `Meta`."""
        model = Profile
        fields = ["image", "bio"]
        widgets = {
            "bio": forms.Textarea(attrs={"rows": 4, "maxlength": 1000}),
        }

    def clean_bio(self):
        """Выполняет логику `clean_bio` с параметрами из сигнатуры."""
        bio = self.cleaned_data.get("bio") or ""
        return strip_tags(bio).strip()

    def clean_image(self):
        """Проверяет формат и размеры аватара до сохранения."""
        image = self.cleaned_data.get("image")
        if not image:
            return image

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(image) as uploaded:
                    width, height = uploaded.size
                    if width > MAX_PROFILE_IMAGE_SIDE or height > MAX_PROFILE_IMAGE_SIDE:
                        raise forms.ValidationError(
                            f"Максимальный размер аватара: {MAX_PROFILE_IMAGE_SIDE}x{MAX_PROFILE_IMAGE_SIDE}."
                        )
                    if (width * height) > MAX_PROFILE_IMAGE_PIXELS:
                        raise forms.ValidationError(
                            f"Максимум {MAX_PROFILE_IMAGE_PIXELS} пикселей."
                        )
                    uploaded.verify()
        except forms.ValidationError:
            raise
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise forms.ValidationError("Изображение слишком большое.")
        except (OSError, ValueError, Image.UnidentifiedImageError):
            raise forms.ValidationError("Некорректный формат изображения.")
        finally:
            if hasattr(image, "seek"):
                image.seek(0)

        return image
