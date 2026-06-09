// app/core/node/auth/login/login.js

// Ждём полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordField = document.getElementById('password');
    
    if (toggleBtn && passwordField) {
        toggleBtn.addEventListener('click', function() {
            // Переключаем тип поля
            const type = passwordField.type === 'password' ? 'text' : 'password';
            passwordField.type = type;
            
            // Меняем иконку
            if (type === 'password') {
                toggleBtn.textContent = '👁️';
            } else {
                toggleBtn.textContent = '👁️';
            }
        });
    }
});