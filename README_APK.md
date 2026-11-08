# 📱 Как собрать APK файл через GitHub Actions

В проект добавлен готовый модуль Android WebView обертки (`android-wrapper`) и автоматический скрипт сборки в GitHub Actions (`.github/workflows/build-apk.yml`).

## 🚀 Пошаговая инструкция для получения готового APK:

1. **Залей проект в свой GitHub репозиторий**:
   ```bash
   git add .
   git commit -m "Add Android APK WebView wrapper & GitHub Actions workflow"
   git push origin main
   ```

2. **Перейди во вкладку Actions на странице репозитория на GitHub**:
   - Нажми на вкладку **Actions**.
   - Выбери воркфлоу **Build Android APK Wrapper**.
   - Нажми **Run workflow** (или дождись автоматического запуска при коммите).

3. **Скачай готовый APK**:
   - Через 1–2 минуты сборка завершится.
   - Открой успешный запуск в Actions и пролистай вниз до раздела **Artifacts**.
   - Нажми и скачай готовый файл **`IGseek-v1.0-debug.apk`** на свой телефон!

---

### ⚙️ Что уже настроено в обертке:
- **Полная трансляция веб-сайта** (`https://igseek-1821.ai.studio`).
- **Поддержка прикрепления файлов и фото** (File Chooser & Camera input).
- **Поддержка локального хранилища** (LocalStorage & SessionStorage & Cookies).
- **Кнопка «Назад» на телефоне** с сохранением истории переходов внутри сайта.
- **Поддержка аппаратного ускорения и полноэкранного режима**.
