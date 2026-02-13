import sys


if sys.version_info >= (3, 14):
    try:
        from django.template import context as django_context

        def _basecontext_copy(self):
            duplicate = self.__class__.__new__(self.__class__)
            duplicate.__dict__.update(self.__dict__)
            duplicate.dicts = self.dicts[:]
            return duplicate

        django_context.BaseContext.__copy__ = _basecontext_copy
    except Exception:
        # Best-effort compatibility patch for Python 3.14 + Django 4.1.
        pass
