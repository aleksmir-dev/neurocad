# core/index/urls.py

from django.urls import path
from .views import index_content

urlpatterns = [
    path('content/', index_content),
]