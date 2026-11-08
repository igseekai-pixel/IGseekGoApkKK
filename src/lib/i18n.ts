import { useEffect, useState } from "react";

export type LangCode = "en" | "ru" | "es" | "fr" | "ar";

type Dict = Partial<Record<LangCode, string>>;

// English is the source key. Missing translations fall back to the key itself.
const DICT: Record<string, Dict> = {
  // Sidebar
  "AI assistant": { ru: "AI-ассистент", es: "Asistente de IA", fr: "Assistant IA", ar: "مساعد ذكي" },
  "New chat": { ru: "Новый чат", es: "Nuevo chat", fr: "Nouveau chat", ar: "محادثة جديدة" },
  "Search chats": { ru: "Поиск по чатам", es: "Buscar chats", fr: "Rechercher", ar: "بحث في المحادثات" },
  "Chat": { ru: "Чат", es: "Chat", fr: "Chat", ar: "محادثة" },
  "Features": { ru: "Возможности", es: "Funciones", fr: "Fonctionnalités", ar: "الميزات" },
  "Discover": { ru: "Открытие", es: "Descubrir", fr: "Découvrir", ar: "استكشاف" },
  "Analytics": { ru: "Аналитика", es: "Analítica", fr: "Analytique", ar: "تحليلات" },
  "Library": { ru: "Библиотека", es: "Biblioteca", fr: "Bibliothèque", ar: "المكتبة" },
  "Saved": { ru: "Сохранённое", es: "Guardados", fr: "Enregistrés", ar: "المحفوظات" },
  "Engine": { ru: "Engine", es: "Engine", fr: "Engine", ar: "Engine" },
  "Soon": { ru: "Скоро", es: "Pronto", fr: "Bientôt", ar: "قريبًا" },
  "Recent": { ru: "Недавние", es: "Recientes", fr: "Récents", ar: "الأخيرة" },
  "No chats yet": { ru: "Пока нет чатов", es: "Aún no hay chats", fr: "Aucun chat pour l'instant", ar: "لا توجد محادثات بعد" },
  "Start a new conversation — your history will appear here.": {
    ru: "Начните новый разговор — история появится здесь.",
    es: "Inicia una conversación — tu historial aparecerá aquí.",
    fr: "Démarrez une conversation — votre historique s'affichera ici.",
    ar: "ابدأ محادثة جديدة — سيظهر السجل هنا.",
  },
  "Sign in to start saving your conversations.": {
    ru: "Войдите, чтобы сохранять разговоры.",
    es: "Inicia sesión para guardar tus conversaciones.",
    fr: "Connectez-vous pour sauvegarder vos conversations.",
    ar: "سجّل الدخول لحفظ محادثاتك.",
  },
  "Sign in to IGseek": { ru: "Вход в IGseek", es: "Inicia sesión en IGseek", fr: "Connectez-vous à IGseek", ar: "تسجيل الدخول إلى IGseek" },
  "Enter your name or email": {
    ru: "Введите имя или почту",
    es: "Introduce tu nombre o correo",
    fr: "Entrez votre nom ou e-mail",
    ar: "أدخل اسمك أو بريدك",
  },
  "Continue": { ru: "Продолжить", es: "Continuar", fr: "Continuer", ar: "متابعة" },
  "Demo mode — no verification, history stays on this device": {
    ru: "Демо-режим — без проверки, история хранится только на этом устройстве",
    es: "Modo demo — sin verificación, el historial se guarda en este dispositivo",
    fr: "Mode démo — sans vérification, l'historique reste sur cet appareil",
    ar: "وضع تجريبي — بدون تحقق، يبقى السجل على هذا الجهاز",
  },
  "IGseek Pro": { ru: "IGseek Pro", es: "IGseek Pro", fr: "IGseek Pro", ar: "IGseek Pro" },
  "Upgrade to Pro": { ru: "Улучшить до Pro", es: "Mejorar a Pro", fr: "Passer à Pro", ar: "الترقية إلى Pro" },
  "You have unlimited access to every IGseek feature.": {
    ru: "У вас безлимитный доступ ко всем функциям IGseek.",
    es: "Tienes acceso ilimitado a todas las funciones de IGseek.",
    fr: "Vous avez un accès illimité à toutes les fonctionnalités d'IGseek.",
    ar: "لديك وصول غير محدود إلى جميع ميزات IGseek.",
  },
  "Unlimited deep research, competitor tracking & content generation.": {
    ru: "Безлимитный deep research, трекинг конкурентов и генерация контента.",
    es: "Investigación profunda ilimitada, seguimiento de competidores y generación de contenido.",
    fr: "Recherche approfondie illimitée, suivi des concurrents et génération de contenu.",
    ar: "بحث معمّق غير محدود، تتبع للمنافسين وتوليد للمحتوى.",
  },
  "Get Pro →": { ru: "Получить Pro →", es: "Obtener Pro →", fr: "Obtenir Pro →", ar: "احصل على Pro ←" },
  "Pro plan": { ru: "План Pro", es: "Plan Pro", fr: "Offre Pro", ar: "خطة Pro" },
  "Free plan": { ru: "Бесплатный план", es: "Plan gratis", fr: "Offre gratuite", ar: "الخطة المجانية" },
  "Sign in": { ru: "Войти", es: "Entrar", fr: "Se connecter", ar: "تسجيل الدخول" },

  // Header
  "LIVE index": { ru: "LIVE индекс", es: "Índice LIVE", fr: "Index LIVE", ar: "مؤشر LIVE" },
  "Default": { ru: "По умолчанию", es: "Predet.", fr: "Défaut", ar: "افتراضي" },
  "Fast": { ru: "Быстрый", es: "Rápido", fr: "Rapide", ar: "سريع" },
  "Language": { ru: "Язык", es: "Idioma", fr: "Langue", ar: "اللغة" },
  "Change language": { ru: "Сменить язык", es: "Cambiar idioma", fr: "Changer de langue", ar: "تغيير اللغة" },
  "Switch to light": { ru: "Светлая тема", es: "Tema claro", fr: "Thème clair", ar: "الوضع الفاتح" },
  "Switch to dark": { ru: "Тёмная тема", es: "Tema oscuro", fr: "Thème sombre", ar: "الوضع الداكن" },
  "Toggle theme": { ru: "Сменить тему", es: "Cambiar tema", fr: "Basculer le thème", ar: "تبديل السمة" },
  "Select model": { ru: "Выбрать модель", es: "Seleccionar modelo", fr: "Choisir le modèle", ar: "اختيار النموذج" },

  // Hero
  "What are we": { ru: "Что мы", es: "¿Qué", fr: "Que", ar: "ماذا" },
  "seeking": { ru: "ищем", es: "buscamos", fr: "cherchons", ar: "نبحث" },
  "today?": { ru: "сегодня?", es: "hoy?", fr: "aujourd'hui ?", ar: "اليوم؟" },
  "Your AI research assistant — explore ideas, analyze signals, and create content that actually performs.": {
    ru: "Ваш AI-ассистент для ресёрча — исследуйте идеи, анализируйте сигналы и создавайте контент, который работает.",
    es: "Tu asistente de investigación con IA — explora ideas, analiza señales y crea contenido que funciona.",
    fr: "Votre assistant de recherche IA — explorez des idées, analysez des signaux et créez du contenu efficace.",
    ar: "مساعد البحث الذكي — استكشف الأفكار وحلّل الإشارات وأنشئ محتوى فعّالًا.",
  },
  "Sign in to get started": {
    ru: "Войдите, чтобы начать",
    es: "Inicia sesión para empezar",
    fr: "Connectez-vous pour commencer",
    ar: "سجّل الدخول للبدء",
  },

  // Suggestions
  "Analyze trends": { ru: "Анализ трендов", es: "Ver tendencias", fr: "Tendances", ar: "تحليل الرائج" },
  "Analyze trending content": { ru: "Анализ трендов", es: "Ver tendencias", fr: "Tendances", ar: "تحليل الرائج" },
  "in your niche this week": { ru: "в вашей нише за эту неделю", es: "en tu nicho esta semana", fr: "dans votre niche cette semaine", ar: "في مجالك هذا الأسبوع" },
  "Trends": { ru: "Тренды", es: "Tendencias", fr: "Tendances", ar: "الرائج" },
  "Competitor audit": { ru: "Аудит конкурентов", es: "Auditar rivales", fr: "Audit concurrents", ar: "تدقيق المنافسين" },
  "Audit a competitor": { ru: "Аудит конкурентов", es: "Auditar rivales", fr: "Audit concurrents", ar: "تدقيق المنافسين" },
  "market signals & positioning": { ru: "рыночные сигналы и позиционирование", es: "señales de mercado и позиционирование", fr: "signaux de marché et positionnement", ar: "إشارات السوق والتموضع" },
  "Research": { ru: "Ресёрч", es: "Investigación", fr: "Recherche", ar: "بحث" },
  "Converting topics": { ru: "Темы для охватов", es: "Temas de impacto", fr: "Sujets porteurs", ar: "مواضيع رابحة" },
  "Find topics that convert": { ru: "Темы для охватов", es: "Temas de impacto", fr: "Sujets porteurs", ar: "مواضيع رابحة" },
  "for your next campaign": { ru: "для следующей кампании", es: "para tu próxima campaña", fr: "pour votre prochaine campagne", ar: "لحملتك القادمة" },
  "Growth": { ru: "Рост", es: "Crecimiento", fr: "Croissance", ar: "نمو" },
  "Weekly plan": { ru: "Контент-план", es: "Plan semanal", fr: "Plan hebdo", ar: "خطة أسبوعية" },
  "Generate a weekly content plan": { ru: "Контент-план", es: "Plan semanal", fr: "Plan hebdo", ar: "خطة أسبوعية" },
  "across formats and channels": { ru: "по форматам и каналам", es: "en formatos y canales", fr: "sur les formats et canaux", ar: "عبر الصيغ والقنوات" },
  "Content": { ru: "Контент", es: "Contenido", fr: "Contenu", ar: "المحتوى" },

  // Composer
  "Ask IGseek anything…": {
    ru: "Спросите IGseek о чём угодно…",
    es: "Pregunta lo que quieras a IGseek…",
    fr: "Demandez ce que vous voulez à IGseek…",
    ar: "اسأل IGseek عن أي شيء…",
  },
  "Ask IGseek about a profile, trend, hashtag…": {
    ru: "Спросите IGseek о профиле, тренде, хэштеге…",
    es: "Pregunta a IGseek sobre un perfil, tendencia, hashtag…",
    fr: "Demandez à IGseek à propos d'un profil, tendance, hashtag…",
    ar: "اسأل IGseek عن ملف، اتجاه، وسم…",
  },
  "Sign in to start chatting with IGseek…": {
    ru: "Войдите, чтобы общаться с IGseek…",
    es: "Inicia sesión para chatear con IGseek…",
    fr: "Connectez-vous pour discuter avec IGseek…",
    ar: "سجّل الدخول للدردشة مع IGseek…",
  },
  "Attach": { ru: "Прикрепить", es: "Adjuntar", fr: "Joindre", ar: "إرفاق" },
  "Deep research": { ru: "Deep research", es: "Investigación profunda", fr: "Recherche approfondie", ar: "بحث معمّق" },
  "Web": { ru: "Веб", es: "Web", fr: "Web", ar: "الويب" },
  "Voice": { ru: "Голос", es: "Voz", fr: "Voix", ar: "الصوت" },
  "Send": { ru: "Отправить", es: "Enviar", fr: "Envoyer", ar: "إرسال" },
  "Remove": { ru: "Убрать", es: "Quitar", fr: "Retirer", ar: "إزالة" },
  "Attach file": { ru: "Прикрепить файл", es: "Adjuntar archivo", fr: "Joindre un fichier", ar: "إرفاق ملف" },
  "Stop": { ru: "Остановить", es: "Detener", fr: "Arrêter", ar: "إيقاف" },
  "Thinking": { ru: "Размышления", es: "Razonamiento", fr: "Raisonnement", ar: "التفكير" },
  "Reasoner on": { ru: "Размышления включены", es: "Razonador activado", fr: "Raisonneur activé", ar: "المُفكِّر مفعّل" },
  "Reasoner off": { ru: "Размышления выключены", es: "Razonador desactivado", fr: "Raisonneur désactivé", ar: "المُفكِّر مُعطّل" },
  "Image": { ru: "Изображение", es: "Imagen", fr: "Image", ar: "صورة" },
  "Generating image": { ru: "Создаю изображение", es: "Generando imagen", fr: "Génération de l'image", ar: "جاري إنشاء الصورة" },
  "Almost ready": { ru: "Почти готово", es: "Casi listo", fr: "Presque prêt", ar: "على وشك الانتهاء" },
  "Something went wrong. Please try again.": {
    ru: "Что-то пошло не так. Попробуйте ещё раз.",
    es: "Algo salió mal. Inténtalo de nuevo.",
    fr: "Une erreur s'est produite. Veuillez réessayer.",
    ar: "حدث خطأ ما. حاول مرة أخرى.",
  },

  "Sign in to send": { ru: "Войдите, чтобы отправить", es: "Inicia sesión para enviar", fr: "Connectez-vous pour envoyer", ar: "سجّل الدخول للإرسال" },

  "IGseek can make mistakes. Verify important insights before acting on them.": {
    ru: "IGseek может ошибаться. Проверяйте важные выводы перед действиями.",
    es: "IGseek puede cometer errores. Verifica los datos importantes antes de actuar.",
    fr: "IGseek peut se tromper. Vérifiez les informations importantes avant d'agir.",
    ar: "قد يخطئ IGseek. تحقّق من المعلومات المهمة قبل التصرف.",
  },
  "You need to sign in to use IGseek.": {
    ru: "Чтобы пользоваться IGseek, войдите в аккаунт.",
    es: "Debes iniciar sesión para usar IGseek.",
    fr: "Vous devez vous connecter pour utiliser IGseek.",
    ar: "يجب تسجيل الدخول لاستخدام IGseek.",
  },

  // Locked shell
  "Sign in to unlock": { ru: "Войдите, чтобы открыть", es: "Inicia sesión para desbloquear", fr: "Connectez-vous pour débloquer", ar: "سجّل الدخول لفتح" },

  // Discover
  "Explore trending formats, hooks and niches — refreshed every hour from our live index.": {
    ru: "Изучайте трендовые форматы, хуки и ниши — обновляется каждый час из live-индекса.",
    es: "Explora formatos, ganchos y nichos en tendencia — actualizado cada hora.",
    fr: "Explorez les formats, accroches et niches tendance — mis à jour toutes les heures.",
    ar: "استكشف الصيغ والعناوين والمجالات الرائجة — يُحدَّث كل ساعة.",
  },
  "Trending in the live index this week": {
    ru: "В тренде live-индекса на этой неделе",
    es: "Tendencia en el índice live esta semana",
    fr: "Tendance dans l'index live cette semaine",
    ar: "رائج في المؤشر المباشر هذا الأسبوع",
  },
  "Beauty": { ru: "Красота", es: "Belleza", fr: "Beauté", ar: "الجمال" },
  "Fitness": { ru: "Фитнес", es: "Fitness", fr: "Fitness", ar: "لياقة" },
  "Food": { ru: "Еда", es: "Comida", fr: "Cuisine", ar: "طعام" },
  "Fashion": { ru: "Мода", es: "Moda", fr: "Mode", ar: "أزياء" },
  "Tech": { ru: "Тех", es: "Tech", fr: "Tech", ar: "تقنية" },
  "Travel": { ru: "Путешествия", es: "Viajes", fr: "Voyage", ar: "سفر" },

  // Analytics
  "Track performance metrics and engagement patterns across your content.": {
    ru: "Следите за метриками и паттернами вовлечённости по вашему контенту.",
    es: "Sigue métricas y patrones de participación de tu contenido.",
    fr: "Suivez les métriques et les schémas d'engagement de votre contenu.",
    ar: "تابع مقاييس الأداء وأنماط التفاعل عبر محتواك.",
  },
  "Followers": { ru: "Подписчики", es: "Seguidores", fr: "Abonnés", ar: "المتابعون" },
  "Reach (7d)": { ru: "Охват (7д)", es: "Alcance (7d)", fr: "Portée (7j)", ar: "الوصول (7ي)" },
  "Engagement": { ru: "Вовлечённость", es: "Interacción", fr: "Engagement", ar: "التفاعل" },
  "Weekly reach": { ru: "Охват за неделю", es: "Alcance semanal", fr: "Portée hebdo", ar: "الوصول الأسبوعي" },

  // Library
  "Your saved templates, scripts and frameworks — reusable across every campaign.": {
    ru: "Ваши сохранённые шаблоны, скрипты и фреймворки — для любой кампании.",
    es: "Tus plantillas, guiones y marcos guardados — reutilizables en cada campaña.",
    fr: "Vos modèles, scripts et frameworks enregistrés — réutilisables.",
    ar: "قوالبك ونصوصك المحفوظة — قابلة لإعادة الاستخدام في كل حملة.",
  },
  "Hook templates": { ru: "Шаблоны хуков", es: "Plantillas de ganchos", fr: "Modèles d'accroches", ar: "قوالب العناوين" },
  "Caption frameworks": { ru: "Фреймворки подписей", es: "Marcos de captions", fr: "Frameworks de légendes", ar: "أطر التسميات" },
  "Reel scripts": { ru: "Сценарии Reels", es: "Guiones de reels", fr: "Scripts de reels", ar: "نصوص Reels" },
  "Story sequences": { ru: "Сториз-сценарии", es: "Secuencias de stories", fr: "Séquences de stories", ar: "تسلسلات القصص" },
  "items": { ru: "элементов", es: "elementos", fr: "éléments", ar: "عناصر" },

  // Saved
  "Bookmarked answers, audits and ideas — always one click away.": {
    ru: "Сохранённые ответы, аудиты и идеи — всегда под рукой.",
    es: "Respuestas, auditorías e ideas guardadas — a un clic.",
    fr: "Réponses, audits et idées enregistrés — à un clic.",
    ar: "إجابات وتدقيقات وأفكار محفوظة — على بُعد نقرة.",
  },
  "2d ago": { ru: "2 дн. назад", es: "hace 2d", fr: "il y a 2j", ar: "قبل يومين" },

  // Engine
  "Build something with IGseek…": {
    ru: "Создайте что-нибудь с IGseek…",
    es: "Construye algo con IGseek…",
    fr: "Créez quelque chose avec IGseek…",
    ar: "ابنِ شيئًا باستخدام IGseek…",
  },
  "Build interactive apps, components & dashboards directly in your browser.": {
    ru: "Создавайте интерактивные приложения, компоненты и дашборды прямо в браузере.",
    es: "Crea aplicaciones interactivas, componentes y paneles en tu navegador.",
    fr: "Créez des applications interactives, composants et tableaux de bord dans votre navigateur.",
    ar: "أنشئ تطبيقات تفاعلية ومكونات ولوحات تحكم مباشرة في متصفحك.",
  },
  "SaaS Landing": { ru: "SaaS лендинг", es: "Landing SaaS", fr: "Landing SaaS", ar: "صفحة هبوط SaaS" },
  "E-commerce Dashboard": { ru: "Интернет-магазин", es: "Panel E-commerce", fr: "Tableau E-commerce", ar: "لوحة متجر إلكتروني" },
  "Mobile App UI": { ru: "Мобильный интерфейс", es: "Interfaz Móvil", fr: "Interface Mobile", ar: "واجهة تطبيق جوال" },
  "REST API Service": { ru: "REST API сервис", es: "Servicio REST API", fr: "Service API REST", ar: "خدمة REST API" },
  "Files": { ru: "Файлы", es: "Archivos", fr: "Fichiers", ar: "الملفات" },
  "Deploy": { ru: "Деплой", es: "Desplegar", fr: "Déployer", ar: "نشر" },
  "Deploy to Vercel": { ru: "Деплой на Vercel", es: "Desplegar en Vercel", fr: "Déployer sur Vercel", ar: "النشر على Vercel" },
  "New File": { ru: "Новый файл", es: "Nuevo archivo", fr: "Nouveau fichier", ar: "ملف جديد" },
  "Delete File": { ru: "Удалить файл", es: "Eliminar файл", fr: "Supprimer le fichier", ar: "حذف الملف" },
  "Launch Preview": { ru: "Запустить превью", es: "Lanzar vista previa", fr: "Lancer l'aperçu", ar: "تشغيل المعاينة" },
  "Vercel Deployment Instructions": { ru: "Инструкция по деплою на Vercel", es: "Instrucciones de despliegue en Vercel", fr: "Instructions de déploiement Vercel", ar: "تعليمات النشر على Vercel" },
  "Vercel Configuration": { ru: "Конфигурация Vercel", es: "Configuración de Vercel", fr: "Configuration Vercel", ar: "إعدادات Vercel" },
  "Code generated successfully! Updated files available in Files tab.": {
    ru: "Код успешно сгенерирован! Обновлённые файлы доступны во вкладке «Файлы».",
    es: "¡Código generado con éxito! Archivos actualizados en la pestaña Archivos.",
    fr: "Code généré avec succès ! Fichiers disponibles dans l'onglet Fichiers.",
    ar: "تم إنشاء الشيفرة بنجاح! الملفات المحدثة متاحة في تبويب الملفات.",
  },
  "Coming · in the next update": { ru: "Скоро · в следующем обновлении", es: "Próximamente · en la próxima actualización", fr: "Bientôt · dans la prochaine mise à jour", ar: "قريبًا · في التحديث القادم" },
  "A tool for building projects right inside IGseek. Describe an idea — the AI writes real code, shows a live preview and lets you download everything you vibe-coded as a single archive.": {
    ru: "Инструмент для разработки проектов прямо внутри IGseek. Опишите идею — ИИ соберёт настоящий код, покажет живой предпросмотр и позволит скачать всё, что вы навайбкодили, одним архивом.",
    es: "Herramienta para construir proyectos dentro de IGseek. Describe una idea — la IA escribe código real, muestra una vista en vivo y te permite descargar todo en un archivo.",
    fr: "Un outil pour construire des projets dans IGseek. Décrivez une idée — l'IA écrit du vrai code, affiche un aperçu en direct et vous laisse tout télécharger.",
    ar: "أداة لبناء مشاريع داخل IGseek. صف الفكرة — يكتب الذكاء الاصطناعي شيفرة حقيقية ويعرض معاينة مباشرة ويتيح لك تنزيل كل شيء كأرشيف واحد.",
  },
  "Real files": { ru: "Реальные файлы", es: "Archivos reales", fr: "Fichiers réels", ar: "ملفات حقيقية" },
  "The AI writes real project code — components, styles, configs — not just chat text.": {
    ru: "ИИ пишет настоящий код проекта — компоненты, стили, конфиги — а не просто текст в чате.",
    es: "La IA escribe código real — componentes, estilos, configs — no solo texto.",
    fr: "L'IA écrit du vrai code — composants, styles, configs — pas juste du texte.",
    ar: "يكتب الذكاء الاصطناعي شيفرة حقيقية للمشروع — مكونات وأنماط وإعدادات — لا مجرد نص.",
  },
  "Live preview": { ru: "Живой предпросмотр", es: "Vista en vivo", fr: "Aperçu en direct", ar: "معاينة مباشرة" },
  "Watch the project build on the fly, iterate by voice or text.": {
    ru: "Смотрите, как проект собирается на лету, вносите правки голосом или текстом.",
    es: "Observa cómo se construye el proyecto al vuelo e itera por voz o texto.",
    fr: "Regardez le projet se construire en direct et itérez par voix ou texte.",
    ar: "شاهد بناء المشروع مباشرة وعدّل بالصوت أو النص.",
  },
  ".zip export": { ru: "Экспорт .zip", es: "Exportar .zip", fr: "Export .zip", ar: "تصدير .zip" },
  "Grab the whole vibe-coded project as a single archive and run it anywhere.": {
    ru: "Заберите весь навайбкоженный проект одним архивом и запускайте где угодно.",
    es: "Descarga todo el proyecto en un único archivo y ejecútalo donde quieras.",
    fr: "Récupérez tout le projet dans une seule archive et exécutez-le où vous voulez.",
    ar: "احصل على المشروع كاملًا في أرشيف واحد وشغّله في أي مكان.",
  },
  "IGseek model": { ru: "IGseek-модель", es: "Modelo IGseek", fr: "Modèle IGseek", ar: "نموذج IGseek" },
  "Same engine as chat — understands niches and rising trends.": {
    ru: "Тот же движок, что и в чате — понимает контекст ниш и растущих трендов.",
    es: "El mismo motor que el chat — entiende nichos y tendencias emergentes.",
    fr: "Même moteur que le chat — comprend les niches et les tendances émergentes.",
    ar: "المحرّك نفسه المستخدم في المحادثة — يفهم المجالات والاتجاهات الصاعدة.",
  },
  "Arriving in the next update": { ru: "Появится в следующем обновлении", es: "Llega en la próxima actualización", fr: "Arrive dans la prochaine mise à jour", ar: "سيصل في التحديث القادم" },
  "We're polishing the engine. No sign-up required to read about Engine.": {
    ru: "Мы допиливаем движок. Никакой регистрации не требуется, чтобы почитать про Engine.",
    es: "Estamos puliendo el motor. No hace falta registrarse para leer sobre Engine.",
    fr: "Nous peaufinons le moteur. Aucune inscription requise pour lire sur Engine.",
    ar: "نعمل على تحسين المحرّك. لا حاجة للتسجيل لقراءة المزيد عن Engine.",
  },
  "Soon →": { ru: "Скоро →", es: "Pronto →", fr: "Bientôt →", ar: "قريبًا ←" },

  // Auth modal
  "IGseek · Auth": { ru: "IGseek · Вход", es: "IGseek · Auth", fr: "IGseek · Auth", ar: "IGseek · دخول" },
  "Password reset": { ru: "Сброс пароля", es: "Restablecer contraseña", fr: "Réinitialiser le mot de passe", ar: "إعادة تعيين كلمة المرور" },
  "Sign in to your account": { ru: "Войдите в аккаунт", es: "Inicia sesión en tu cuenta", fr: "Connectez-vous à votre compte", ar: "سجّل الدخول إلى حسابك" },
  "Enter your email — we'll send a reset link.": {
    ru: "Введите email — мы отправим ссылку для сброса пароля.",
    es: "Introduce tu email — te enviaremos un enlace de restablecimiento.",
    fr: "Entrez votre e-mail — nous vous enverrons un lien de réinitialisation.",
    ar: "أدخل بريدك — سنرسل رابط إعادة التعيين.",
  },
  "A smart new-generation AI assistant": {
    ru: "Умный AI-ассистент нового поколения",
    es: "Un asistente de IA inteligente de nueva generación",
    fr: "Un assistant IA intelligent nouvelle génération",
    ar: "مساعد ذكي من الجيل الجديد",
  },
  "Log in": { ru: "Вход", es: "Entrar", fr: "Connexion", ar: "دخول" },
  "Register": { ru: "Регистрация", es: "Registro", fr: "Inscription", ar: "تسجيل" },
  "Connecting…": { ru: "Подключение…", es: "Conectando…", fr: "Connexion…", ar: "جارٍ الاتصال…" },
  "Continue with Google": { ru: "Продолжить с Google", es: "Continuar con Google", fr: "Continuer avec Google", ar: "المتابعة عبر Google" },
  "Only mac & iphone": { ru: "Только mac и iphone", es: "Solo mac y iphone", fr: "Uniquement mac & iphone", ar: "لـ mac و iphone فقط" },
  "Continue with Apple": { ru: "Продолжить с Apple", es: "Continuar con Apple", fr: "Continuer avec Apple", ar: "المتابعة عبر Apple" },
  "or": { ru: "или", es: "o", fr: "ou", ar: "أو" },
  "Name": { ru: "Имя", es: "Nombre", fr: "Nom", ar: "الاسم" },
  "Login": { ru: "Логин", es: "Usuario", fr: "Identifiant", ar: "اسم المستخدم" },
  "Password": { ru: "Пароль", es: "Contraseña", fr: "Mot de passe", ar: "كلمة المرور" },
  "Log in button": { ru: "Войти", es: "Entrar", fr: "Se connecter", ar: "دخول" },
  "Create account": { ru: "Создать аккаунт", es: "Crear cuenta", fr: "Créer un compte", ar: "إنشاء حساب" },
  "Forgot password?": { ru: "Забыли пароль?", es: "¿Olvidaste tu contraseña?", fr: "Mot de passe oublié ?", ar: "نسيت كلمة المرور؟" },
  "Reset link sent to": { ru: "Ссылка для сброса отправлена на", es: "Enlace de restablecimiento enviado a", fr: "Lien de réinitialisation envoyé à", ar: "أُرسل رابط إعادة التعيين إلى" },
  "Back": { ru: "Назад", es: "Volver", fr: "Retour", ar: "رجوع" },
  "Send link": { ru: "Отправить", es: "Enviar", fr: "Envoyer", ar: "إرسال" },
  "One account per device · By continuing you agree to the privacy policy": {
    ru: "Один аккаунт на устройство · Продолжая, вы соглашаетесь с политикой конфиденциальности",
    es: "Una cuenta por dispositivo · Al continuar aceptas la política de privacidad",
    fr: "Un compte par appareil · En continuant, vous acceptez la politique de confidentialité",
    ar: "حساب واحد لكل جهاز · بالمتابعة فأنت توافق على سياسة الخصوصية",
  },
  "Close": { ru: "Закрыть", es: "Cerrar", fr: "Fermer", ar: "إغلاق" },

  // Profile
  "Subscription": { ru: "Подписка", es: "Suscripción", fr: "Abonnement", ar: "الاشتراك" },
  "Pro": { ru: "Pro", es: "Pro", fr: "Pro", ar: "Pro" },
  "Free": { ru: "Free", es: "Free", fr: "Free", ar: "Free" },
  "Unlimited deep research, competitor tracking, priority content generation.": {
    ru: "Безлимитные глубокие исследования, трекинг конкурентов, приоритетная генерация контента.",
    es: "Investigación profunda ilimitada, seguimiento de competidores y generación prioritaria.",
    fr: "Recherche approfondie illimitée, suivi concurrentiel, génération prioritaire.",
    ar: "بحث معمّق غير محدود، تتبع للمنافسين وتوليد ذو أولوية.",
  },
  "Price": { ru: "Стоимость", es: "Precio", fr: "Prix", ar: "السعر" },
  "$19 / month": { ru: "$19 / месяц", es: "$19 / mes", fr: "19 $ / mois", ar: "$19 / شهريًا" },
  "Next charge": { ru: "Следующее списание", es: "Próximo cobro", fr: "Prochain prélèvement", ar: "الفوترة التالية" },
  "in 28 days": { ru: "через 28 дней", es: "en 28 días", fr: "dans 28 jours", ar: "خلال 28 يومًا" },
  "Cancel Pro subscription?": { ru: "Отменить подписку Pro?", es: "¿Cancelar la suscripción Pro?", fr: "Annuler l'abonnement Pro ?", ar: "إلغاء اشتراك Pro؟" },
  "Access remains until the end of the paid period.": {
    ru: "Доступ сохранится до конца оплаченного периода.",
    es: "El acceso continuará hasta el fin del período pagado.",
    fr: "L'accès reste actif jusqu'à la fin de la période payée.",
    ar: "يبقى الوصول متاحًا حتى نهاية الفترة المدفوعة.",
  },
  "Keep": { ru: "Оставить", es: "Mantener", fr: "Conserver", ar: "الإبقاء" },
  "Cancel": { ru: "Отменить", es: "Cancelar", fr: "Annuler", ar: "إلغاء" },
  "Cancel subscription": { ru: "Отменить подписку", es: "Cancelar suscripción", fr: "Annuler l'abonnement", ar: "إلغاء الاشتراك" },
  "Upgrade to Pro plan": { ru: "Перейти на Pro", es: "Cambiar a Pro", fr: "Passer à Pro", ar: "الترقية إلى Pro" },
  "Unlock unlimited analysis, deep competitor research and unlimited content generation.": {
    ru: "Разблокируйте безлимитный анализ, deep research по конкурентам и генерацию контента без ограничений.",
    es: "Desbloquea análisis ilimitado, investigación profunda de competidores y generación sin límites.",
    fr: "Débloquez l'analyse illimitée, la recherche concurrentielle approfondie et la génération sans limites.",
    ar: "افتح التحليل غير المحدود والبحث المعمّق للمنافسين وتوليد المحتوى بلا حدود.",
  },
  "Unlimited chats": { ru: "Безлимитные чаты", es: "Chats ilimitados", fr: "Chats illimités", ar: "محادثات غير محدودة" },
  "Live trend index": { ru: "Live-индекс трендов", es: "Índice de tendencias en vivo", fr: "Index de tendances en direct", ar: "مؤشر الاتجاهات المباشر" },
  "Export reports": { ru: "Экспорт отчётов", es: "Exportar informes", fr: "Export des rapports", ar: "تصدير التقارير" },
  "Priority support": { ru: "Приоритетная поддержка", es: "Soporte prioritario", fr: "Support prioritaire", ar: "دعم ذو أولوية" },
  "Subscribe · $19/mo": { ru: "Оформить Pro · $19/мес", es: "Suscribirse · $19/mes", fr: "S'abonner · 19 $/mois", ar: "اشترك · $19/شهر" },
  "Member since": { ru: "Аккаунт с", es: "Miembro desde", fr: "Membre depuis", ar: "عضو منذ" },
  "Log out": { ru: "Выйти", es: "Cerrar sesión", fr: "Se déconnecter", ar: "تسجيل الخروج" },
  "Agent": { ru: "Агент", es: "Agente", fr: "Agent", ar: "الوكيل" },
  "Choose agent": { ru: "Выберите агента", es: "Elige un agente", fr: "Choisir un agent", ar: "اختر الوكيل" },
  "agent.universal.name": { en: "Universal", ru: "Универсальный", es: "Universal", fr: "Universel", ar: "شامل" },
  "agent.universal.role": { en: "General assistant", ru: "Универсальный помощник", es: "Asistente general", fr: "Assistant général", ar: "مساعد عام" },
  "agent.code.name": { en: "Code", ru: "Код", es: "Código", fr: "Code", ar: "برمجة" },
  "agent.code.role": { en: "Development & engineering", ru: "Разработка и инженерия", es: "Desarrollo e ingeniería", fr: "Développement et ingénierie", ar: "التطوير والهندسة" },
  "agent.learning.name": { en: "Learning", ru: "Обучение", es: "Aprendizaje", fr: "Apprentissage", ar: "تعلّم" },
  "agent.learning.role": { en: "Learning & mentorship", ru: "Обучение и наставничество", es: "Aprendizaje y mentoría", fr: "Apprentissage et mentorat", ar: "التعلّم والإرشاد" },
  "agent.communication.name": { en: "Communication", ru: "Коммуникация", es: "Comunicación", fr: "Communication", ar: "تواصل" },
  "agent.communication.role": { en: "Writing & communication", ru: "Тексты и коммуникация", es: "Textos y comunicación", fr: "Rédaction et communication", ar: "الكتابة والتواصل" },
  "agent.psychologist.name": { en: "Psychologist", ru: "Психолог", es: "Psicólogo", fr: "Psychologue", ar: "دعم نفسي" },
  "agent.psychologist.role": { en: "Emotional support", ru: "Психологическая поддержка", es: "Apoyo emocional", fr: "Soutien émotionnel", ar: "الدعم النفسي" },
  "agent.hacker.name": { en: "Hacker", ru: "Хакер", es: "Hacker", fr: "Hacker", ar: "أمن معلومات" },
  "agent.hacker.role": { en: "Authorized cybersecurity", ru: "Разрешённая кибербезопасность", es: "Ciberseguridad autorizada", fr: "Cybersécurité autorisée", ar: "الأمن السيبراني المُصرّح" },

  // Donations / Support
  "Support": { en: "Support", ru: "Поддержать", es: "Apoyar", fr: "Soutenir", ar: "دعم" },
  "Support IGseek": { en: "Support IGseek", ru: "Поддержать IGseek", es: "Apoyar a IGseek", fr: "Soutenir IGseek", ar: "ادعم IGseek" },
  "Close sidebar": { en: "Close sidebar", ru: "Скрыть сайдбар", es: "Cerrar barra lateral", fr: "Fermer la barre latérale", ar: "إغلاق الشريط الجانبي" },
  "Open sidebar": { en: "Open sidebar", ru: "Показать сайдбар", es: "Abrir barra lateral", fr: "Ouvrir la barre latérale", ar: "فتح الشريط الجانبي" },
  "Donate 50₽": { en: "Donate 50₽", ru: "Донат 50₽", es: "Donar 50₽", fr: "Faire un don 50₽", ar: "تبرّع 50₽" },
  "Every donation helps keep IGseek fast, free-tier friendly and independent.": {
    en: "Every donation helps keep IGseek fast, free-tier friendly and independent.",
    ru: "Каждый донат помогает держать IGseek быстрым, доступным и независимым.",
    es: "Cada donación mantiene IGseek rápido, accesible e independiente.",
    fr: "Chaque don aide à garder IGseek rapide, accessible et indépendant.",
    ar: "كل تبرّع يساعد على إبقاء IGseek سريعًا ومتاحًا ومستقلًا.",
  },
  "Opening…": { en: "Opening…", ru: "Открываю…", es: "Abriendo…", fr: "Ouverture…", ar: "جارٍ الفتح…" },

  // Docs tab
  "Docs": { en: "Docs", ru: "Документы", es: "Documentos", fr: "Documents", ar: "المستندات" },
  "Legal documents and support contacts.": {
    en: "Legal documents and support contacts.",
    ru: "Юридические документы и контакты поддержки.",
    es: "Documentos legales y contactos de soporte.",
    fr: "Documents juridiques et contacts de support.",
    ar: "المستندات القانونية وجهات اتصال الدعم.",
  },
  "Privacy Policy": { en: "Privacy Policy", ru: "Политика конфиденциальности", es: "Política de privacidad", fr: "Politique de confidentialité", ar: "سياسة الخصوصية" },
  "User Agreement": { en: "User Agreement", ru: "Пользовательское соглашение", es: "Acuerdo de usuario", fr: "Contrat d'utilisation", ar: "اتفاقية المستخدم" },
  "Project & AI Agreement": { en: "Project & AI Agreement", ru: "Пользовательское соглашение проекта и нейросети", es: "Acuerdo del proyecto y de la IA", fr: "Contrat projet et IA", ar: "اتفاقية المشروع والذكاء الاصطناعي" },
  "How we handle your data.": { en: "How we handle your data.", ru: "Как мы работаем с вашими данными.", es: "Cómo tratamos tus datos.", fr: "Comment nous traitons vos données.", ar: "كيف نتعامل مع بياناتك." },
  "General terms of use.": { en: "General terms of use.", ru: "Общие условия использования.", es: "Términos generales de uso.", fr: "Conditions générales d'utilisation.", ar: "الشروط العامة للاستخدام." },
  "Rules that cover the project and its AI.": { en: "Rules that cover the project and its AI.", ru: "Правила, охватывающие проект и его ИИ.", es: "Reglas del proyecto y su IA.", fr: "Règles couvrant le projet et son IA.", ar: "قواعد المشروع والذكاء الاصطناعي." },
  "Open": { en: "Open", ru: "Открыть", es: "Abrir", fr: "Ouvrir", ar: "فتح" },
  "Support contact": { en: "Support contact", ru: "Контакт поддержки", es: "Contacto de soporte", fr: "Contact du support", ar: "جهة اتصال الدعم" },
  "Reach out on Telegram": { en: "Reach out on Telegram", ru: "Напишите нам в Telegram", es: "Escríbenos en Telegram", fr: "Écrivez-nous sur Telegram", ar: "تواصل معنا عبر تيليجرام" },

  // Signup consents
  "Continue to sign up": { en: "Continue to sign up", ru: "Продолжить регистрацию", es: "Continuar el registro", fr: "Continuer l'inscription", ar: "متابعة التسجيل" },
  "I have read and agree to the Privacy Policy": {
    en: "I have read and agree to the Privacy Policy",
    ru: "Я прочитал(а) и согласен(на) с Политикой конфиденциальности",
    es: "He leído y acepto la Política de privacidad",
    fr: "J'ai lu et j'accepte la Politique de confidentialité",
    ar: "قرأت ووافقت على سياسة الخصوصية",
  },
  "I have read and agree to the User Agreement": {
    en: "I have read and agree to the User Agreement",
    ru: "Я прочитал(а) и согласен(на) с Пользовательским соглашением",
    es: "He leído y acepto el Acuerdo de usuario",
    fr: "J'ai lu et j'accepte le Contrat d'utilisation",
    ar: "قرأت ووافقت على اتفاقية المستخدم",
  },
  "I have read and agree to the Project & AI Agreement": {
    en: "I have read and agree to the Project & AI Agreement",
    ru: "Я прочитал(а) и согласен(на) с Пользовательским соглашением проекта и нейросети",
    es: "He leído y acepto el Acuerdo del proyecto y de la IA",
    fr: "J'ai lu et j'accepte le Contrat projet et IA",
    ar: "قرأت ووافقت على اتفاقية المشروع والذكاء الاصطناعي",
  },
  "I confirm I am at least 18 years old": {
    en: "I confirm I am at least 18 years old",
    ru: "Мне исполнилось 18 лет",
    es: "Confirmo que tengo al menos 18 años",
    fr: "Je confirme avoir au moins 18 ans",
    ar: "أؤكد أن عمري 18 عامًا أو أكثر",
  },
  "You must accept all four items to create an account.": {
    en: "You must accept all four items to create an account.",
    ru: "Чтобы создать аккаунт, нужно согласиться со всеми четырьмя пунктами.",
    es: "Debes aceptar los cuatro puntos para crear una cuenta.",
    fr: "Vous devez accepter les quatre points pour créer un compte.",
    ar: "يجب الموافقة على البنود الأربعة لإنشاء حساب.",
  },
  "Sign in to your account.": { en: "Sign in to your account.", ru: "Войдите в свой аккаунт.", es: "Inicia sesión en tu cuenta.", fr: "Connectez-vous à votre compte.", ar: "سجّل الدخول إلى حسابك." },
  "Create your IGseek account.": { en: "Create your IGseek account.", ru: "Создайте аккаунт IGseek.", es: "Crea tu cuenta de IGseek.", fr: "Créez votre compte IGseek.", ar: "أنشئ حساب IGseek الخاص بك." },
  "Opening Google…": { en: "Opening Google…", ru: "Открываем Google…", es: "Abriendo Google…", fr: "Ouverture de Google…", ar: "جارٍ فتح Google…" },
  "or email": { en: "or email", ru: "или email", es: "o email", fr: "ou e-mail", ar: "أو البريد" },
  "Loading…": { en: "Loading…", ru: "Загрузка…", es: "Cargando…", fr: "Chargement…", ar: "جارٍ التحميل…" },
  "Account created. Confirm the email link, then sign in.": {
    en: "Account created. Confirm the email link, then sign in.",
    ru: "Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите.",
    es: "Cuenta creada. Confirma el enlace del correo y luego inicia sesión.",
    fr: "Compte créé. Confirmez le lien e-mail, puis connectez-vous.",
    ar: "تم إنشاء الحساب. أكد رابط البريد ثم سجّل الدخول.",
  },

  // ============ Landing page ============
  "Go to chat": { en: "Go to chat", ru: "Перейти в чат", es: "Ir al chat", fr: "Aller au chat", ar: "الذهاب إلى المحادثة" },
  "Try agents": { en: "Try agents", ru: "Попробовать агентов", es: "Probar agentes", fr: "Essayer les agents", ar: "جرّب الوكلاء" },
  "Back to chat": { en: "Back to chat", ru: "Пока в чат", es: "Volver al chat", fr: "Retour au chat", ar: "العودة إلى المحادثة" },
  "Choose model": { en: "Choose model", ru: "Выбрать модель", es: "Elegir modelo", fr: "Choisir un modèle", ar: "اختر النموذج" },
  "Go to chat · Pro": { en: "Go to chat · Pro", ru: "Перейти в чат · Pro", es: "Ir al chat · Pro", fr: "Aller au chat · Pro", ar: "الذهاب إلى المحادثة · Pro" },
  "Powered by IGseek": { en: "Powered by IGseek", ru: "Работает на IGseek", es: "Con tecnología de IGseek", fr: "Propulsé par IGseek", ar: "مدعوم بواسطة IGseek" },
  "One chat.": { en: "One chat.", ru: "Один чат.", es: "Un chat.", fr: "Un chat.", ar: "محادثة واحدة." },
  "Many": { en: "Many", ru: "Множество", es: "Muchas", fr: "Plusieurs", ar: "عقول" },
  "minds": { en: "minds", ru: "умов", es: "mentes", fr: "esprits", ar: "متعددة" },
  "Specialized AI agents, reasoning mode and code artifacts in one interface. Universal, Coder, Hacker, Mentor, Psy and Creative — switch between minds without losing context and get depth where you need it.": {
    en: "Specialized AI agents, reasoning mode and code artifacts in one interface. Universal, Coder, Hacker, Mentor, Psy and Creative — switch between minds without losing context and get depth where you need it.",
    ru: "Специализированные AI-агенты, reasoning-режим и артефакты кода в одном интерфейсе. Universal, Coder, Hacker, Mentor, Psy и Creative — переключайся между «умами» без потери контекста и получай глубину там, где нужна глубина.",
    es: "Agentes de IA especializados, modo razonamiento y artefactos de código en una interfaz. Universal, Coder, Hacker, Mentor, Psy y Creative — cambia entre mentes sin perder contexto y obtén profundidad donde la necesitas.",
    fr: "Agents IA spécialisés, mode raisonnement et artefacts de code dans une interface. Universal, Coder, Hacker, Mentor, Psy et Creative — changez d'esprit sans perdre le contexte et gagnez en profondeur.",
    ar: "وكلاء ذكاء اصطناعي متخصصون، وضع الاستدلال وعناصر الكود في واجهة واحدة. Universal وCoder وHacker وMentor وPsy وCreative — بدّل بين العقول دون فقدان السياق.",
  },
  "START CHATTING": { en: "START CHATTING", ru: "НАЧАТЬ ЧАТ", es: "EMPEZAR", fr: "COMMENCER", ar: "ابدأ المحادثة" },
  "GO TO CHAT": { en: "GO TO CHAT", ru: "ПЕРЕЙТИ В ЧАТ", es: "IR AL CHAT", fr: "ALLER AU CHAT", ar: "الذهاب إلى المحادثة" },
  "6 specialized agents · 3 IGseek models · IGseek Reasoner inside": {
    en: "6 specialized agents · 3 IGseek models · IGseek Reasoner inside",
    ru: "6 специализированных агентов • 3 модели IGseek • IGseek Reasoner внутри",
    es: "6 agentes especializados · 3 modelos IGseek · IGseek Reasoner incluido",
    fr: "6 agents spécialisés · 3 modèles IGseek · IGseek Reasoner inclus",
    ar: "6 وكلاء متخصصين · 3 نماذج IGseek · مع IGseek Reasoner",
  },
  "Welcome · trailer": { en: "Welcome · trailer", ru: "Добро пожаловать · трейлер", es: "Bienvenida · tráiler", fr: "Bienvenue · bande-annonce", ar: "أهلًا بك · المقطع" },
  "Live demo": { en: "Live demo", ru: "Живое демо", es: "Demo en vivo", fr: "Démo en direct", ar: "عرض مباشر" },
  "90 seconds to feel IGseek — agents, reasoning and artifacts in action.": {
    en: "90 seconds to feel IGseek — agents, reasoning and artifacts in action.",
    ru: "90 секунд, чтобы почувствовать IGseek — агенты, reasoning и артефакты в деле.",
    es: "90 segundos para sentir IGseek — agentes, razonamiento y artefactos en acción.",
    fr: "90 secondes pour ressentir IGseek — agents, raisonnement et artefacts en action.",
    ar: "90 ثانية لتشعر بـ IGseek — الوكلاء والاستدلال والعناصر أثناء العمل.",
  },
  "Six minds. One chat.": { en: "Six minds. One chat.", ru: "Шесть умов. Один чат.", es: "Seis mentes. Un chat.", fr: "Six esprits. Un chat.", ar: "ستة عقول. محادثة واحدة." },
  "Each agent is a distinct character and knowledge profile. Switch instantly without losing context.": {
    en: "Each agent is a distinct character and knowledge profile. Switch instantly without losing context.",
    ru: "Каждый агент — отдельный характер и профиль знаний. Переключайся мгновенно без потери контекста.",
    es: "Cada agente es un carácter y perfil de conocimiento distintos. Cambia al instante sin perder contexto.",
    fr: "Chaque agent est un caractère et un profil de connaissances distincts. Changez instantanément sans perdre le contexte.",
    ar: "كل وكيل شخصية وملف معرفي منفصل. بدّل فورًا دون فقدان السياق.",
  },
  "Engine · soon": { en: "Engine · soon", ru: "Engine · скоро", es: "Engine · pronto", fr: "Engine · bientôt", ar: "Engine · قريبًا" },
  "Vibe-code entire projects.": { en: "Vibe-code entire projects.", ru: "Vibe-code целые проекты.", es: "Vibe-code de proyectos completos.", fr: "Vibe-code des projets entiers.", ar: "برمج مشاريع كاملة بالإحساس." },
  "A tool where AI writes real files and you download the finished project. Coming in the next update.": {
    en: "A tool where AI writes real files and you download the finished project. Coming in the next update.",
    ru: "Инструмент, в котором ИИ пишет реальные файлы, а вы скачиваете готовый проект. Появится в следующем обновлении.",
    es: "Una herramienta donde la IA escribe archivos reales y descargas el proyecto terminado. Llega en la próxima actualización.",
    fr: "Un outil où l'IA écrit de vrais fichiers et vous téléchargez le projet terminé. Arrive dans la prochaine mise à jour.",
    ar: "أداة يكتب فيها الذكاء الاصطناعي ملفات حقيقية وتنزّل المشروع الجاهز. قادمة في التحديث القادم.",
  },
  "Status: in development — follow updates in the app.": {
    en: "Status: in development — follow updates in the app.",
    ru: "Статус: в разработке — следите за обновлениями в приложении.",
    es: "Estado: en desarrollo — sigue las actualizaciones en la app.",
    fr: "Statut : en développement — suivez les mises à jour dans l'app.",
    ar: "الحالة: قيد التطوير — تابع التحديثات في التطبيق.",
  },
  "AI writes real project files, not snippets.": { en: "AI writes real project files, not snippets.", ru: "ИИ пишет настоящие файлы проекта, не отрывки.", es: "La IA escribe archivos reales, no fragmentos.", fr: "L'IA écrit de vrais fichiers, pas des extraits.", ar: "الذكاء الاصطناعي يكتب ملفات مشروع حقيقية لا مقتطفات." },
  "Full project": { en: "Full project", ru: "Полный проект", es: "Proyecto completo", fr: "Projet complet", ar: "مشروع كامل" },
  "Multi-file structure, dependencies, configs.": { en: "Multi-file structure, dependencies, configs.", ru: "Многофайловая структура, зависимости, конфиги.", es: "Estructura multi-archivo, dependencias, configs.", fr: "Structure multi-fichiers, dépendances, configs.", ar: "بنية متعددة الملفات، تبعيات وإعدادات." },
  "Vibe-code": { en: "Vibe-code", ru: "Vibe-code", es: "Vibe-code", fr: "Vibe-code", ar: "Vibe-code" },
  "Describe an idea in words — get a working prototype.": { en: "Describe an idea in words — get a working prototype.", ru: "Опишите идею словами — получите работающий прототип.", es: "Describe una idea con palabras — obtén un prototipo.", fr: "Décrivez une idée en mots — obtenez un prototype.", ar: "صف الفكرة بالكلمات واحصل على نموذج يعمل." },
  "Export": { en: "Export", ru: "Экспорт", es: "Exportar", fr: "Exporter", ar: "تصدير" },
  "Download the archive and continue locally.": { en: "Download the archive and continue locally.", ru: "Скачайте архив и продолжайте локально.", es: "Descarga el archivo y continúa en local.", fr: "Téléchargez l'archive et continuez en local.", ar: "نزّل الأرشيف وتابع محليًا." },
  "Three IGseek models + R1.": { en: "Three IGseek models + R1.", ru: "Три модели IGseek + R1.", es: "Tres modelos IGseek + R1.", fr: "Trois modèles IGseek + R1.", ar: "ثلاثة نماذج IGseek + R1." },
  "Pick by task: speed, conversation or deep reasoning.": { en: "Pick by task: speed, conversation or deep reasoning.", ru: "Выбирай по задаче: скорость, разговор или глубокие рассуждения.", es: "Elige por tarea: velocidad, conversación o razonamiento profundo.", fr: "Choisissez selon la tâche : vitesse, conversation ou raisonnement.", ar: "اختر حسب المهمة: السرعة أو الحوار أو الاستدلال العميق." },
  "Start free. Grow with a subscription.": { en: "Start free. Grow with a subscription.", ru: "Начни бесплатно. Расти по подписке.", es: "Empieza gratis. Crece con la suscripción.", fr: "Commencez gratuitement. Grandissez avec l'abonnement.", ar: "ابدأ مجانًا. انمُ مع الاشتراك." },
  "Founders offer": { en: "Founders offer", ru: "Founders offer", es: "Oferta Founders", fr: "Offre Founders", ar: "عرض المؤسسين" },
  "— first 50 signups get": { en: "— first 50 signups get", ru: "— первые 50 регистраций получают", es: "— los primeros 50 registros obtienen", fr: "— les 50 premiers inscrits reçoivent", ar: "— أول 50 مسجّل يحصلون على" },
  "Pro forever": { en: "Pro forever", ru: "Pro навсегда", es: "Pro para siempre", fr: "Pro pour toujours", ar: "Pro إلى الأبد" },
  "left of 50": { en: "left of 50", ru: "из 50", es: "de 50", fr: "sur 50", ar: "من أصل 50" },
  "left": { en: "left", ru: "Осталось", es: "Quedan", fr: "Il reste", ar: "متبقٍ" },
  "Founders offer ended — all 50 seats taken.": { en: "Founders offer ended — all 50 seats taken.", ru: "Founders offer завершён — все 50 мест разобраны.", es: "La oferta Founders ha terminado — 50 plazas ocupadas.", fr: "Offre Founders terminée — 50 places occupées.", ar: "انتهى عرض المؤسسين — تم شغل جميع الأماكن الخمسين." },
  "Popular": { en: "Popular", ru: "Популярный", es: "Popular", fr: "Populaire", ar: "الأكثر شعبية" },
  "forever": { en: "forever", ru: "навсегда", es: "para siempre", fr: "pour toujours", ar: "إلى الأبد" },
  "per month": { en: "per month", ru: "в месяц", es: "al mes", fr: "par mois", ar: "شهريًا" },

  // Agents (landing)
  "Universal IGseek without specialization — a base for any task.": { en: "Universal IGseek without specialization — a base for any task.", ru: "Универсальный IGseek без специализации — база для любых задач.", es: "IGseek universal sin especialización — base para cualquier tarea.", fr: "IGseek universel sans spécialisation — base pour toute tâche.", ar: "IGseek عام بدون تخصص — أساس لأي مهمة." },
  "Hardcore engineer: code, architecture, debugging, refactoring.": { en: "Hardcore engineer: code, architecture, debugging, refactoring.", ru: "Хардкорный инженер: код, архитектура, отладка, рефакторинг.", es: "Ingeniero hardcore: código, arquitectura, depuración, refactor.", fr: "Ingénieur hardcore : code, architecture, débogage, refactor.", ar: "مهندس صارم: كود، معمارية، تصحيح وإعادة هيكلة." },
  "Red-team bias: reverse, offsec, low-level and vuln analysis.": { en: "Red-team bias: reverse, offsec, low-level and vuln analysis.", ru: "Red-team уклон: reverse, offsec, low-level и разбор уязвимостей.", es: "Perfil red-team: reverse, offsec, low-level y análisis de vulns.", fr: "Orientation red-team : reverse, offsec, low-level et analyse de vulns.", ar: "توجه Red-Team: عكس هندسي، أمن هجومي، منخفض المستوى وتحليل الثغرات." },
  "Explains complex things simply, in layers, with examples.": { en: "Explains complex things simply, in layers, with examples.", ru: "Объясняет сложное простыми словами, слоями и с примерами.", es: "Explica lo complejo con simplicidad, por capas y con ejemplos.", fr: "Explique le complexe simplement, en couches et avec des exemples.", ar: "يشرح المعقّد ببساطة، بطبقات وأمثلة." },
  "Cold psychoanalysis and blunt situation breakdown.": { en: "Cold psychoanalysis and blunt situation breakdown.", ru: "Холодный психоанализ и прямой разбор ситуаций без сюсюканья.", es: "Psicoanálisis frío y análisis directo de situaciones.", fr: "Psychanalyse froide et analyse directe des situations.", ar: "تحليل نفسي بارد وتفكيك مباشر للمواقف." },
  "Storytelling, ideas, copy, concepts and creative formats.": { en: "Storytelling, ideas, copy, concepts and creative formats.", ru: "Сторителлинг, идеи, тексты, концепты и креативные форматы.", es: "Narrativa, ideas, textos, conceptos y formatos creativos.", fr: "Storytelling, idées, textes, concepts et formats créatifs.", ar: "سرد، أفكار، نصوص، مفاهيم وأشكال إبداعية." },

  // Models (landing)
  "Flagship: depth and quality for complex tasks.": { en: "Flagship: depth and quality for complex tasks.", ru: "Флагман: глубина и качество для сложных задач.", es: "Buque insignia: profundidad y calidad para tareas complejas.", fr: "Fleuron : profondeur et qualité pour les tâches complexes.", ar: "الرائد: عمق وجودة للمهام المعقدة." },
  "Conversational model with long context and soft tone.": { en: "Conversational model with long context and soft tone.", ru: "Разговорная модель с долгим контекстом и мягким тоном.", es: "Modelo conversacional con contexto largo y tono suave.", fr: "Modèle conversationnel avec contexte long et ton doux.", ar: "نموذج حواري بسياق طويل ونبرة ناعمة." },
  "Ultra-fast answers for iterations and short queries.": { en: "Ultra-fast answers for iterations and short queries.", ru: "Ультра-быстрые ответы для итераций и коротких запросов.", es: "Respuestas ultrarrápidas para iteraciones y consultas cortas.", fr: "Réponses ultra-rapides pour les itérations et requêtes courtes.", ar: "إجابات فائقة السرعة للتكرارات والاستفسارات القصيرة." },
  "Reasoning mode with explicit chain of thought.": { en: "Reasoning mode with explicit chain of thought.", ru: "Reasoning-режим с явной цепочкой рассуждений.", es: "Modo razonamiento con cadena de pensamiento explícita.", fr: "Mode raisonnement avec chaîne de pensée explicite.", ar: "وضع الاستدلال مع سلسلة أفكار صريحة." },

  // Plan features
  "Universal agent": { en: "Universal agent", ru: "Universal агент", es: "Agente Universal", fr: "Agent Universal", ar: "الوكيل العام" },
  "IGseek F1": { en: "IGseek F1", ru: "IGseek F1", es: "IGseek F1", fr: "IGseek F1", ar: "IGseek F1" },
  "Basic chat": { en: "Basic chat", ru: "Базовый чат", es: "Chat básico", fr: "Chat basique", ar: "محادثة أساسية" },
  "7-day history": { en: "7-day history", ru: "История 7 дней", es: "Historial de 7 días", fr: "Historique 7 jours", ar: "سجل 7 أيام" },
  "All 6 agents": { en: "All 6 agents", ru: "Все 6 агентов", es: "Los 6 agentes", fr: "Les 6 agents", ar: "الوكلاء الستة جميعًا" },
  "All models + Reasoner": { en: "All models + Reasoner", ru: "Все модели + Reasoner", es: "Todos los modelos + Reasoner", fr: "Tous les modèles + Reasoner", ar: "كل النماذج + Reasoner" },
  "Artifacts and code blocks": { en: "Artifacts and code blocks", ru: "Артефакты и код-блоки", es: "Artefactos y bloques de código", fr: "Artefacts et blocs de code", ar: "العناصر وكتل الكود" },
  "Unlimited history": { en: "Unlimited history", ru: "Безлимитная история", es: "Historial ilimitado", fr: "Historique illimité", ar: "سجل غير محدود" },
  "Long-term memory": { en: "Long-term memory", ru: "Долговременная память", es: "Memoria a largo plazo", fr: "Mémoire longue durée", ar: "ذاكرة طويلة المدى" },

  // Reset password
  "New password": { en: "New password", ru: "Новый пароль", es: "Nueva contraseña", fr: "Nouveau mot de passe", ar: "كلمة مرور جديدة" },
  "Enter a new password for your account.": { en: "Enter a new password for your account.", ru: "Введите новый пароль для аккаунта.", es: "Introduce una nueva contraseña.", fr: "Entrez un nouveau mot de passe.", ar: "أدخل كلمة مرور جديدة لحسابك." },
  "Verifying recovery link…": { en: "Verifying recovery link…", ru: "Проверяем ссылку восстановления…", es: "Verificando el enlace…", fr: "Vérification du lien…", ar: "جارٍ التحقق من رابط الاستعادة…" },
  "Password updated. Redirecting…": { en: "Password updated. Redirecting…", ru: "Пароль обновлён. Перенаправляем…", es: "Contraseña actualizada. Redirigiendo…", fr: "Mot de passe mis à jour. Redirection…", ar: "تم تحديث كلمة المرور. جارٍ التحويل…" },
  "Saving…": { en: "Saving…", ru: "Сохраняем…", es: "Guardando…", fr: "Enregistrement…", ar: "جارٍ الحفظ…" },
  "Save": { en: "Save", ru: "Сохранить", es: "Guardar", fr: "Enregistrer", ar: "حفظ" },
};

const LOCALES: Record<LangCode, string> = {
  en: "en-US",
  ru: "ru-RU",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
};

export function makeT(lang: LangCode) {
  return (key: string) => DICT[key]?.[lang] ?? key;
}

export function localeFor(lang: LangCode) {
  return LOCALES[lang] ?? "en-US";
}

/** Read `igseek:lang` from localStorage. Subscribes to cross-tab `storage` and
 *  same-tab `igseek:lang-change` custom events so any page reflects the choice
 *  made in /app. */
export function readStoredLang(): LangCode {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem("igseek:lang");
  if (v === "en" || v === "ru" || v === "es" || v === "fr" || v === "ar") return v;
  return "en";
}

/** React hook that returns the current UI language, listening for changes
 *  written to localStorage under `igseek:lang` (cross-tab + same-tab). */
export function useLang(): LangCode {
  const [lang, setLang] = useState<LangCode>(() => readStoredLang());
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLang(readStoredLang());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "igseek:lang") setLang(readStoredLang());
    };
    const onCustom = () => setLang(readStoredLang());
    window.addEventListener("storage", onStorage);
    window.addEventListener("igseek:lang-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("igseek:lang-change", onCustom);
    };
  }, []);
  return lang;
}

/** React hook returning the translate function for the current language. */
export function useT() {
  const lang = useLang();
  return makeT(lang);
}


