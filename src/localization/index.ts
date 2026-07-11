import store from '../state'
import CATEGORIES from './categories'
import TRANSLATION from './translation'
import { configSelectors } from '../state/config'

interface IOptions {
  /** Does result.toLowerCase() */
  toLower?: boolean,
  /** Does result.toUpperCase() */
  toUpper?: boolean
}

const FALLBACK_TRANSLATIONS: Record<string, Record<string, string>> = {
  auto: {
    ru: 'Авто',
    en: 'Car',
    fr: 'Voiture',
    ar: 'سيارة',
  },
  ready: {
    ru: 'Готово',
    en: 'Ready',
    fr: 'Prêt',
    ar: 'جاهز',
  },

  profile: {
    ru: 'Профиль',
    en: 'Profile',
    fr: 'Profil',
    ar: 'الملف الشخصي',
  },
  language: {
    ru: 'Язык',
    en: 'Language',
    fr: 'Langue',
    ar: 'اللغة',
  },
  ok: {
    ru: 'Ок',
    en: 'OK',
    fr: 'OK',
    ar: 'حسناً',
  },
  drive_number: {
    ru: 'Номер авто',
    en: 'Car number',
    fr: 'Numéro du véhicule',
    ar: 'رقم السيارة',
  },
  drive_number_hint: {
    ru: 'Введите 3–4 цифры с двери такси.',
    en: 'Enter the 3–4 digit number from the taxi door.',
    fr: 'Saisissez les 3–4 chiffres sur la portière du taxi.',
    ar: 'أدخل 3-4 أرقام من باب سيارة الأجرة.',
  },

  yes: {
    ru: 'Да',
    en: 'Yes',
    fr: 'Oui',
    ar: 'نعم',
  },
  no: {
    ru: 'Нет',
    en: 'No',
    fr: 'Non',
    ar: 'لا',
  },
  hide_order: {
    ru: 'Скрыть заказ',
    en: 'Hide order',
    fr: 'Masquer la commande',
    ar: 'إخفاء الطلب',
  },

  order_hidden: {
    ru: 'Заказ скрыт',
    en: 'Order hidden',
    fr: 'Commande masquée',
    ar: 'تم إخفاء الطلب',
  },
  emulator_drivers: {
    ru: 'Эмулятор водителей',
    en: 'Driver emulator',
    fr: 'Émulateur de chauffeurs',
    ar: 'محاكي السائقين',
  },
  emulator_clients: {
    ru: 'Эмулятор клиентов',
    en: 'Client emulator',
    fr: 'Émulateur de clients',
    ar: 'محاكي العملاء',
  },
  emulator_drivers_mode: {
    ru: 'Режим эмуляции водителей',
    en: 'Driver emulation mode',
    fr: 'Mode émulation de chauffeurs',
    ar: 'وضع محاكاة السائقين',
  },
  emulator_clients_mode: {
    ru: 'Режим эмуляции клиентов',
    en: 'Client emulation mode',
    fr: 'Mode émulation de clients',
    ar: 'وضع محاكاة العملاء',
  },
  emulator_mode_info_aria: {
    ru: 'Информация о режиме эмуляции',
    en: 'Emulation mode information',
    fr: 'Informations sur le mode émulation',
    ar: 'معلومات وضع المحاكاة',
  },
  emulator_mode_title: {
    ru: 'Режим эмуляции',
    en: 'Emulation mode',
    fr: 'Mode émulation',
    ar: 'وضع المحاكاة',
  },
  emulator_info_intro: {
    ru: 'Режим эмуляции предназначен для знакомства с сервисом, обучения и проверки работы приложения.',
    en: 'Emulation mode is used to explore the service, train users, and check how the app works.',
    fr: 'Le mode émulation sert à découvrir le service, former les utilisateurs et vérifier le fonctionnement de l’application.',
    ar: 'يُستخدم وضع المحاكاة للتعرف على الخدمة والتدريب والتحقق من عمل التطبيق.',
  },
  emulator_info_virtual: {
    ru: 'В этом режиме все заказы, поездки и отклики создаются и обрабатываются виртуальными участниками системы автоматически. Реальные водители и пассажиры в таких поездках не участвуют.',
    en: 'In this mode, all orders, trips, and responses are created and processed automatically by virtual system users. Real drivers and passengers do not take part in these trips.',
    fr: 'Dans ce mode, toutes les commandes, courses et réponses sont créées et traitées automatiquement par des utilisateurs virtuels du système. Les vrais chauffeurs et passagers ne participent pas à ces courses.',
    ar: 'في هذا الوضع، يتم إنشاء ومعالجة جميع الطلبات والرحلات والردود تلقائياً بواسطة مستخدمين افتراضيين. لا يشارك السائقون والركاب الحقيقيون في هذه الرحلات.',
  },
  emulator_info_allows: {
    ru: 'Режим позволяет:',
    en: 'This mode lets you:',
    fr: 'Ce mode permet de :',
    ar: 'يتيح لك هذا الوضع:',
  },
  emulator_info_ui: {
    ru: 'изучить интерфейс и функции приложения;',
    en: 'explore the app interface and features;',
    fr: 'découvrir l’interface et les fonctions de l’application ;',
    ar: 'استكشاف واجهة التطبيق وميزاته؛',
  },
  emulator_info_test_orders: {
    ru: 'безопасно протестировать создание и принятие заказов;',
    en: 'safely test order creation and acceptance;',
    fr: 'tester en toute sécurité la création et l’acceptation des commandes ;',
    ar: 'اختبار إنشاء الطلبات وقبولها بأمان؛',
  },
  emulator_info_modes: {
    ru: 'ознакомиться с режимами поездок, предложений и голосования;',
    en: 'review trip, offer, and voting modes;',
    fr: 'découvrir les modes course, proposition et vote ;',
    ar: 'التعرف على أوضاع الرحلات والعروض والتصويت؛',
  },
  emulator_info_notifications: {
    ru: 'проверить уведомления, статусы и сценарии работы сервиса без выполнения реальных перевозок.',
    en: 'check notifications, statuses, and service scenarios without real transportation.',
    fr: 'vérifier les notifications, les statuts et les scénarios du service sans effectuer de vrais trajets.',
    ar: 'التحقق من الإشعارات والحالات وسيناريوهات الخدمة دون تنفيذ نقل حقيقي.',
  },
  emulator_swipe_down_to_close: {
    ru: 'Смахнуть вниз, чтобы закрыть',
    en: 'Swipe down to close',
    fr: 'Balayez vers le bas pour fermer',
    ar: 'اسحب لأسفل للإغلاق',
  },
  emulator_drivers_subtitle: {
    ru: 'Запуск водителей для заказа',
    en: 'Run drivers for an order',
    fr: 'Lancer des chauffeurs pour une commande',
    ar: 'تشغيل السائقين للطلب',
  },
  emulator_clients_subtitle: {
    ru: 'Автозаказы от клиентов для водителя',
    en: 'Automatic client orders for a driver',
    fr: 'Commandes automatiques de clients pour le chauffeur',
    ar: 'طلبات عملاء تلقائية للسائق',
  },
  emulator_status_running: {
    ru: 'Запущен',
    en: 'Running',
    fr: 'Démarré',
    ar: 'قيد التشغيل',
  },
  emulator_status_stopped: {
    ru: 'Остановлен',
    en: 'Stopped',
    fr: 'Arrêté',
    ar: 'متوقف',
  },
  emulator_start: {
    ru: 'Запустить',
    en: 'Start',
    fr: 'Démarrer',
    ar: 'تشغيل',
  },
  emulator_stop: {
    ru: 'Остановить',
    en: 'Stop',
    fr: 'Arrêter',
    ar: 'إيقاف',
  },
  emulator_check: {
    ru: 'Проверить',
    en: 'Check',
    fr: 'Vérifier',
    ar: 'تحقق',
  },
  emulator_logs_title: {
    ru: 'Журнал работы',
    en: 'Work log',
    fr: 'Journal de travail',
    ar: 'سجل العمل',
  },
  emulator_logs_empty: {
    ru: 'Журнал появится после запуска или проверки.',
    en: 'The log will appear after starting or checking.',
    fr: 'Le journal apparaîtra après le démarrage ou la vérification.',
    ar: 'سيظهر السجل بعد التشغيل أو التحقق.',
  },
  emulator_action_failed: {
    ru: 'Не удалось выполнить действие',
    en: 'Could not perform the action',
    fr: 'Impossible d’effectuer l’action',
    ar: 'تعذر تنفيذ الإجراء',
  },
  select: {
    ru: 'Выбрать',
    en: 'Select',
    fr: 'Sélectionner',
    ar: 'اختيار',
  },
  point_must_be_selected_error: {
    ru: 'Выберите адрес из подсказки или укажите точку на карте',
    en: 'Select an address from suggestions or choose a point on the map',
    fr: 'Sélectionnez une adresse dans les suggestions ou choisissez un point sur la carte',
    ar: 'اختر عنواناً من الاقتراحات أو حدد نقطة على الخريطة',
  },
  map_address_loading: {
    ru: 'Определяем адрес...',
    en: 'Resolving address...',
    fr: 'Recherche de l adresse...',
    ar: 'جاري تحديد العنوان...',
  },
  cancel_driver_choice: {
    ru: 'Отменить выбор водителя',
    en: 'Cancel driver choice',
    fr: 'Annuler le choix du chauffeur',
    ar: 'إلغاء اختيار السائق',
  },
  frontend_log_menu: {
    ru: 'Лог',
    en: 'Log',
    fr: 'Log',
    ar: 'السجل',
  },
  frontend_interface_log_menu: {
    ru: 'Лог интерфейса',
    en: 'Interface log',
    fr: 'Log interface',
    ar: 'سجل الواجهة',
  },
  frontend_flow_log_menu: {
    ru: 'Лог маршрута',
    en: 'Route log',
    fr: 'Log itinéraire',
    ar: 'سجل المسار',
  },
  frontend_log_copied: {
    ru: 'Лог скопирован и очищен. Теперь его можно вставить в чат.',
    en: 'Log copied and cleared. You can paste it into the chat now.',
    fr: 'Le log est copié et effacé. Vous pouvez maintenant le coller dans le chat.',
    ar: 'تم نسخ السجل ومسحه. يمكنك الآن لصقه في المحادثة.',
  },
  frontend_interface_log_copied: {
    ru: 'Лог интерфейса скопирован и очищен. Теперь его можно вставить в чат.',
    en: 'Interface log copied and cleared. You can paste it into the chat now.',
    fr: 'Le log interface est copié et effacé. Vous pouvez maintenant le coller dans le chat.',
    ar: 'تم نسخ سجل الواجهة ومسحه. يمكنك الآن لصقه في المحادثة.',
  },
  frontend_interface_log_downloaded: {
    ru: 'Лог интерфейса выгружен JSON-файлом в загрузки и очищен.',
    en: 'Interface log was exported as a JSON file to downloads and cleared.',
    fr: 'Le log interface a été exporté en fichier JSON dans les téléchargements et effacé.',
    ar: 'تم تصدير سجل الواجهة كملف JSON إلى التنزيلات ومسحه.',
  },
  frontend_flow_log_copied: {
    ru: 'Лог маршрута скопирован и очищен. Теперь его можно вставить в чат.',
    en: 'Route log copied and cleared. You can paste it into the chat now.',
    fr: 'Le log itinéraire est copié et effacé. Vous pouvez maintenant le coller dans le chat.',
    ar: 'تم نسخ سجل المسار ومسحه. يمكنك الآن لصقه في المحادثة.',
  },
  frontend_flow_log_downloaded: {
    ru: 'Лог маршрута выгружен JSON-файлом в загрузки и очищен.',
    en: 'Route log was exported as a JSON file to downloads and cleared.',
    fr: 'Le log itinéraire a été exporté en fichier JSON dans les téléchargements et effacé.',
    ar: 'تم تصدير سجل المسار كملف JSON إلى التنزيلات ومسحه.',
  },
  frontend_raw_log_menu: {
    ru: 'RAW лог',
    en: 'RAW log',
    fr: 'Log RAW',
    ar: 'سجل RAW',
  },
  frontend_raw_log_copied: {
    ru: 'RAW лог скопирован и очищен. Теперь его можно вставить в чат.',
    en: 'RAW log copied and cleared. You can paste it into the chat now.',
    fr: 'Le log RAW est copié et effacé. Vous pouvez maintenant le coller dans le chat.',
    ar: 'تم نسخ سجل RAW ومسحه. يمكنك الآن لصقه في المحادثة.',
  },
  frontend_raw_log_downloaded: {
    ru: 'RAW лог выгружен JSON-файлом в загрузки и очищен.',
    en: 'RAW log was exported as a JSON file to downloads and cleared.',
    fr: 'Le log RAW a été exporté en fichier JSON dans les téléchargements et effacé.',
    ar: 'تم تصدير سجل RAW كملف JSON إلى التنزيلات ومسحه.',
  },
  frontend_raw_log_copy_failed: {
    ru: 'RAW лог собран, но браузер не дал сохранить файл или скопировать текст. Откройте консоль и скопируйте запись taxi-raw-log-export.',
    en: 'RAW log was collected, but the browser did not allow saving the file or copying text. Open the console and copy taxi-raw-log-export.',
    fr: 'Le log RAW a été collecté, mais le navigateur n’a pas autorisé l’enregistrement ou la copie. Ouvrez la console et copiez taxi-raw-log-export.',
    ar: 'تم جمع سجل RAW، لكن المتصفح لم يسمح بحفظ الملف أو نسخ النص. افتح وحدة التحكم وانسخ taxi-raw-log-export.',
  },
  frontend_log_copy_failed: {
    ru: 'Лог собран, но браузер не дал скопировать его автоматически. Откройте консоль и скопируйте запись taxi-front-log-copy.',
    en: 'Log was collected, but the browser did not allow automatic copying. Open the console and copy taxi-front-log-copy.',
    fr: 'Le log a été collecté, mais le navigateur n’a pas autorisé la copie automatique. Ouvrez la console et copiez taxi-front-log-copy.',
    ar: 'تم جمع السجل، لكن المتصفح لم يسمح بالنسخ التلقائي. افتح وحدة التحكم وانسخ taxi-front-log-copy.',
  },
  frontend_interface_log_copy_failed: {
    ru: 'Лог интерфейса собран, но браузер не дал сохранить файл или скопировать текст. Откройте консоль и скопируйте запись taxi-interface-log-export.',
    en: 'Interface log was collected, but the browser did not allow saving the file or copying text. Open the console and copy taxi-interface-log-export.',
    fr: 'Le log interface a été collecté, mais le navigateur n’a pas autorisé la copie automatique. Ouvrez la console et copiez taxi-interface-log-copy.',
    ar: 'تم جمع سجل الواجهة، لكن المتصفح لم يسمح بالنسخ التلقائي. افتح وحدة التحكم وانسخ taxi-interface-log-copy.',
  },
  frontend_flow_log_copy_failed: {
    ru: 'Лог маршрута собран, но браузер не дал сохранить файл или скопировать текст. Откройте консоль и скопируйте запись taxi-flow-log-export.',
    en: 'Route log was collected, but the browser did not allow saving the file or copying text. Open the console and copy taxi-flow-log-export.',
    fr: 'Le log itinéraire a été collecté, mais le navigateur n’a pas autorisé la copie automatique. Ouvrez la console et copiez taxi-flow-log-copy.',
    ar: 'تم جمع سجل المسار، لكن المتصفح لم يسمح بالنسخ التلقائي. افتح وحدة التحكم وانسخ taxi-flow-log-copy.',
  },
  driver_choice_cancel_reason_long_wait: {
    ru: 'Водитель слишком долго едет',
    en: 'The driver is taking too long',
    fr: 'Le chauffeur met trop de temps',
    ar: 'السائق يتأخر كثيراً',
  },
  driver_choice_cancel_reason_another_driver: {
    ru: 'Хочу выбрать другого водителя',
    en: 'I want to choose another driver',
    fr: 'Je veux choisir un autre chauffeur',
    ar: 'أريد اختيار سائق آخر',
  },
  driver_choice_cancel_reason_wrong_choice: {
    ru: 'Ошибся с выбором водителя',
    en: 'I chose the wrong driver',
    fr: 'Je me suis trompe de chauffeur',
    ar: 'اخترت السائق الخطأ',
  },
  driver_choice_cancel_reason_car_not_suitable: {
    ru: 'Не подходит машина водителя',
    en: 'The driver\'s car is not suitable',
    fr: 'La voiture du chauffeur ne convient pas',
    ar: 'سيارة السائق غير مناسبة',
  },
  driver_choice_cancel_reason_other: {
    ru: 'Другая причина',
    en: 'Other reason',
    fr: 'Autre raison',
    ar: 'سبب آخر',
  },
  driver_order_cancelled_by_client: {
    ru: '\u041a\u043b\u0438\u0435\u043d\u0442 \u043e\u0442\u043c\u0435\u043d\u0438\u043b \u0437\u0430\u043a\u0430\u0437.',
    en: 'The customer cancelled the order.',
    fr: 'Le client a annule la commande.',
    ar: '\u0623\u0644\u063a\u0649 \u0627\u0644\u0639\u0645\u064a\u0644 \u0627\u0644\u0637\u0644\u0628.',
  },
  candidate: {
    ru: 'Поиск водителя',
    en: 'Searching for a driver',
    fr: 'Recherche d un chauffeur',
    ar: 'جارٍ البحث عن سائق',
  },
  password: {
    ru: 'Пароль',
    en: 'Password',
    fr: 'Mot de passe',
    ar: 'كلمة المرور',
  },
  password_confirm: {
    ru: 'Повторите пароль',
    en: 'Confirm password',
    fr: 'Confirmer le mot de passe',
    ar: 'تأكيد كلمة المرور',
  },
  password_min_length: {
    ru: 'Пароль должен быть не короче 8 символов',
    en: 'Password must be at least 8 characters',
    fr: 'Le mot de passe doit contenir au moins 8 caractères',
    ar: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',
  },
  passwords_do_not_match: {
    ru: 'Пароли не совпадают',
    en: 'Passwords do not match',
    fr: 'Les mots de passe ne correspondent pas',
    ar: 'كلمتا المرور غير متطابقتين',
  },
  car_registration_partial_success: {
    ru: 'Регистрация прошла успешно, но автомобиль не был создан.',
    en: 'Registration was successful, but the car was not created.',
    fr: 'L inscription a reussi, mais la voiture n a pas ete creee.',
    ar: 'تم التسجيل بنجاح، ولكن لم يتم إنشاء السيارة.',
  },
  car_error_plate_busy: {
    ru: 'Этот номер автомобиля уже занят. Введите другой номер и сохраните данные еще раз.',
    en: 'This car plate number is already in use. Enter another number and save again.',
    fr: 'Ce numero de voiture est deja utilise. Saisissez un autre numero et enregistrez a nouveau.',
    ar: 'رقم السيارة هذا مستخدم بالفعل. أدخل رقما آخر واحفظ البيانات مرة أخرى.',
  },
  car_error_plate_invalid: {
    ru: 'Укажите корректный номер автомобиля.',
    en: 'Enter a valid car plate number.',
    fr: 'Saisissez un numero de voiture valide.',
    ar: 'أدخل رقم سيارة صحيحا.',
  },
  car_error_model_invalid: {
    ru: 'Выберите корректную модель автомобиля.',
    en: 'Select a valid car model.',
    fr: 'Selectionnez un modele de voiture valide.',
    ar: 'اختر طراز سيارة صحيحا.',
  },
  car_error_color_invalid: {
    ru: 'Выберите корректный цвет автомобиля.',
    en: 'Select a valid car color.',
    fr: 'Selectionnez une couleur de voiture valide.',
    ar: 'اختر لون سيارة صحيحا.',
  },
  car_error_photo_invalid: {
    ru: 'Загрузите корректное изображение автомобиля.',
    en: 'Upload a valid car image.',
    fr: 'Telechargez une image de voiture valide.',
    ar: 'حمل صورة سيارة صحيحة.',
  },
  car_error_details_invalid: {
    ru: 'Проверьте дополнительные данные автомобиля и сохраните еще раз.',
    en: 'Check the additional car details and save again.',
    fr: 'Verifiez les informations supplementaires de la voiture et enregistrez a nouveau.',
    ar: 'تحقق من بيانات السيارة الإضافية واحفظ مرة أخرى.',
  },
  car_error_class_invalid: {
    ru: 'Выберите корректный класс автомобиля.',
    en: 'Select a valid car class.',
    fr: 'Selectionnez une classe de voiture valide.',
    ar: 'اختر فئة سيارة صحيحة.',
  },
  car_error_seats_invalid: {
    ru: 'Укажите корректное количество мест.',
    en: 'Enter a valid number of seats.',
    fr: 'Saisissez un nombre de places valide.',
    ar: 'أدخل عدد مقاعد صحيحا.',
  },
  car_save_error: {
    ru: 'Автомобиль не был сохранен. Исправьте данные автомобиля и попробуйте еще раз.',
    en: 'The car was not saved. Fix the car details and try again.',
    fr: 'La voiture n a pas ete enregistree. Corrigez les informations et reessayez.',
    ar: 'لم يتم حفظ السيارة. صحح بيانات السيارة وحاول مرة أخرى.',
  },
  driver_not_approved: {
    ru: 'Ваш аккаунт водителя еще не подтвержден администратором. После проверки вы сможете брать заказы.',
    en: 'Your driver account has not been approved by an administrator yet. After approval, you will be able to take orders.',
    fr: 'Votre compte chauffeur n a pas encore ete approuve par un administrateur. Apres verification, vous pourrez prendre des commandes.',
    ar: 'لم تتم الموافقة على حساب السائق الخاص بك من قبل المسؤول بعد. بعد الموافقة، ستتمكن من قبول الطلبات.',
  },
  driver_status_active: {
    ru: 'Активен',
    en: 'Active',
    fr: 'Actif',
    ar: 'نشط',
  },
  driver_status_active_description: {
    ru: 'Готов к заказам',
    en: 'Ready for orders',
    fr: 'Pret pour les commandes',
    ar: 'جاهز للطلبات',
  },
  driver_status_inactive_with_car: {
    ru: 'Не в сети',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_status_inactive_with_car_description: {
    ru: 'Есть автомобиль',
    en: 'Car added',
    fr: 'Voiture ajoutee',
    ar: 'تمت إضافة السيارة',
  },
  driver_status_inactive_no_car: {
    ru: 'Не в сети',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_status_inactive_no_car_description: {
    ru: 'Нет автомобиля',
    en: 'No car added',
    fr: 'Aucune voiture ajoutee',
    ar: 'لم تتم إضافة سيارة',
  },

  driver_line_online: {
    ru: 'На линии',
    en: 'Online',
    fr: 'En ligne',
    ar: 'متصل',
  },
  driver_line_offline: {
    ru: 'Не на линии',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_line_no_car: {
    ru: 'Авто не добавлено',
    en: 'No car added',
    fr: 'Voiture non ajoutee',
    ar: 'لم تتم إضافة سيارة',
  },
  driver_profile_activated_label: {
    ru: 'Профиль активирован',
    en: 'Profile activated',
    fr: 'Profil active',
    ar: 'تم تفعيل الملف الشخصي',
  },
  driver_profile_pending_label: {
    ru: 'Профиль на проверке',
    en: 'Profile pending',
    fr: 'Profil en verification',
    ar: 'الملف الشخصي قيد المراجعة',
  },
  driver_status_hint_add_car: {
    ru: 'Чтобы водитель мог выйти на линию, сначала нужно добавить автомобиль.',
    en: 'To go online, the driver must add a car first.',
    fr: 'Pour passer en ligne, le chauffeur doit d abord ajouter une voiture.',
    ar: 'لكي يصبح السائق متاحًا على الخط، يجب إضافة سيارة أولاً.',
  },
  driver_status_hint_profile_check: {
    ru: 'Чтобы водитель мог работать на линии, профиль должен пройти подтверждение.',
    en: 'To work online, the driver profile must be approved first.',
    fr: 'Pour travailler en ligne, le profil du chauffeur doit d abord etre approuve.',
    ar: 'لكي يعمل السائق على الخط، يجب اعتماد الملف الشخصي أولاً.',
  },
  driver_status_hint_header_change: {
    ru: 'Профиль подтвержден, доступность на линии можно менять из статуса в шапке приложения.',
    en: 'The profile is approved. Availability can be changed from the status control in the header.',
    fr: 'Le profil est approuve. La disponibilite peut etre modifiee depuis le statut dans l en-tete.',
    ar: 'تم اعتماد الملف الشخصي. يمكن تغيير التوفر من عنصر الحالة في رأس التطبيق.',
  },
  driver_status_need_car: {
    ru: 'Для выхода на линию сначала добавьте автомобиль.',
    en: 'Add a car first to go online.',
    fr: 'Ajoutez d abord une voiture pour passer en ligne.',
    ar: 'أضف سيارة أولاً لتصبح متاحًا على الخط.',
  },
  driver_status_need_approval: {
    ru: 'Изменение доступности доступно только подтвержденному водителю.',
    en: 'Availability can only be changed by an approved driver.',
    fr: 'La disponibilite ne peut etre modifiee que par un chauffeur approuve.',
    ar: 'لا يمكن تغيير التوفر إلا من قبل سائق معتمد.',
  },
  driver_status_updated_online: {
    ru: 'Статус обновлен: водитель на линии.',
    en: 'Status updated: the driver is online.',
    fr: 'Statut mis a jour : le chauffeur est en ligne.',
    ar: 'تم تحديث الحالة: السائق متاح على الخط.',
  },
  driver_status_updated_offline: {
    ru: 'Статус обновлен: водитель не на линии.',
    en: 'Status updated: the driver is offline.',
    fr: 'Statut mis a jour : le chauffeur est hors ligne.',
    ar: 'تم تحديث الحالة: السائق غير متاح على الخط.',
  },
  driver_status_change_failed: {
    ru: 'Не удалось изменить статус водителя',
    en: 'Could not change the driver status',
    fr: 'Impossible de changer le statut du chauffeur',
    ar: 'تعذر تغيير حالة السائق',
  },
  driver_voting_ready_action: {
    ru: 'Готов взять',
    en: 'Ready to take',
    fr: 'Pret a prendre',
    ar: 'جاهز للقبول',
  },
  driver_voting_ready_sent_description: {
    ru: 'Готовность водителя отмечена. Ожидайте выбора клиента.',
    en: 'The driver readiness has been noted. Wait for the customer to choose a driver.',
    fr: 'La disponibilite du chauffeur a ete notee. Attendez que le client choisisse un chauffeur.',
    ar: 'تم تسجيل جاهزية السائق. انتظر اختيار العميل للسائق.',
  },
  driver_voting_going_action: {
    ru: 'Еду на вызов',
    en: 'Going to the call',
    fr: 'Je vais a l appel',
    ar: 'أنا في الطريق إلى الطلب',
  },
  driver_voting_navigation: {
    ru: 'Навигация',
    en: 'Navigation',
    fr: 'Navigation',
    ar: 'الملاحة',
  },
  driver_voting_arrived: {
    ru: 'На месте',
    en: 'Arrived',
    fr: 'Sur place',
    ar: 'وصلت',
  },
  driver_voting_cancel_departure: {
    ru: 'Отменить выезд',
    en: 'Cancel departure',
    fr: 'Annuler le depart',
    ar: 'إلغاء الانطلاق',
  },
  driver_voting_waiting: {
    ru: 'Клиент ожидает',
    en: 'Customer is waiting',
    fr: 'Le client attend',
    ar: 'العميل ينتظر',
  },
  driver_voting_status_participating: {
    ru: 'Вы едете на вызов. Заказ пока не закреплен за вами.',
    en: 'You are going to the call. The order is not assigned to you yet.',
    fr: 'Vous allez a l appel. La commande ne vous est pas encore attribuee.',
    ar: 'أنت في الطريق إلى الطلب. لم يتم تعيين الطلب لك بعد.',
  },
  driver_voting_competitors: {
    ru: 'Конкуренты',
    en: 'Competitors',
    fr: 'Concurrents',
    ar: 'المنافسون',
  },
  driver_voting_nearest_competitor: {
    ru: 'Ближайший конкурент',
    en: 'Nearest competitor',
    fr: 'Concurrent le plus proche',
    ar: 'أقرب منافس',
  },
  driver_voting_nearest_competitors: {
    ru: 'Ближайшие',
    en: 'Nearest',
    fr: 'Les plus proches',
    ar: 'الأقرب',
  },
  driver_voting_ready_sent: {
    ru: 'Участие отмечено',
    en: 'Participation noted',
    fr: 'Participation notee',
    ar: 'تم تسجيل المشاركة',
  },
  driver_voting_cancelled: {
    ru: 'Выезд отменен',
    en: 'Departure cancelled',
    fr: 'Depart annule',
    ar: 'تم إلغاء الانطلاق',
  },
  driver_voting_arrived_sent: {
    ru: 'Клиенту отправлен сигнал, что водитель на месте.',
    en: 'The customer was notified that the driver has arrived.',
    fr: 'Le client a ete informe que le chauffeur est arrive.',
    ar: 'تم إشعار العميل بأن السائق وصل.',
  },
  driver_voting_confirm_code: {
    ru: 'Подтвердить код',
    en: 'Confirm code',
    fr: 'Confirmer le code',
    ar: 'تأكيد الرمز',
  },
  driver_voting_code_sent: {
    ru: 'Код отправлен на проверку.',
    en: 'The code was sent for verification.',
    fr: 'Le code a ete envoye pour verification.',
    ar: 'تم إرسال الرمز للتحقق.',
  },
  driver_voting_closed_by_other: {
    ru: 'Клиент уже выбрал другого водителя. Voting-заказ закрыт для вас.',
    en: 'The customer has already chosen another driver. This voting order is closed for you.',
    fr: 'Le client a deja choisi un autre chauffeur. Cette commande voting est fermee pour vous.',
    ar: 'اختار العميل سائقا آخر بالفعل. تم إغلاق هذا الطلب لك.',
  },
  driver_voting_closed_by_client: {
    ru: 'Клиент отменил ожидание.',
    en: 'The customer cancelled the waiting.',
    fr: 'Le client a annule l attente.',
    ar: 'ألغى العميل الانتظار.',
  },
  driver_voting_closed_timeout: {
    ru: 'Время ожидания истекло. Клиент не выбрал водителя, заказ закрыт.',
    en: 'The waiting time has expired. The customer did not choose a driver, so the order is closed.',
    fr: 'Le temps d attente a expire. Le client n a pas choisi de chauffeur, la commande est fermee.',
    ar: 'انتهى وقت الانتظار. لم يختر العميل سائقا، لذلك تم إغلاق الطلب.',
  },
  driver_route_time: {
    ru: 'Примерно ехать',
    en: 'Estimated drive time',
    fr: 'Temps de trajet estime',
    ar: 'وقت الوصول التقريبي',
  },
  client_pickup_eta: {
    ru: 'До точки подачи',
    en: 'To pickup point',
    fr: 'Vers le point de prise en charge',
    ar: 'إلى نقطة الالتقاء',
  },
  client_driver_arrived: {
    ru: 'Водитель на месте и ожидает вас.',
    en: 'The driver has arrived and is waiting for you.',
    fr: 'Le chauffeur est arrive et vous attend.',
    ar: 'وصل السائق وينتظرك.',
  },
  client_boarding_code: {
    ru: 'Код посадки',
    en: 'Boarding code',
    fr: 'Code d embarquement',
    ar: 'رمز الصعود',
  },
  client_boarding_code_hint: {
    ru: 'Назовите этот код водителю после посадки.',
    en: 'Tell this code to the driver after boarding.',
    fr: 'Indiquez ce code au chauffeur apres l embarquement.',
    ar: 'أخبر السائق بهذا الرمز بعد الصعود.',
  },
  wrong_boarding_code: {
    ru: 'Неверный код посадки.',
    en: 'Wrong boarding code.',
    fr: 'Code d embarquement incorrect.',
    ar: 'رمز الصعود غير صحيح.',
  },
  show_my_location: {
    ru: 'Показать моё местоположение',
    en: 'Show my location',
    fr: 'Afficher ma position',
    ar: 'إظهار موقعي',
  },
  message_modal_success_title: {
    ru: 'Операция выполнена успешно',
    en: 'Operation completed successfully',
    fr: 'Operation terminee avec succes',
    ar: 'تمت العملية بنجاح',
  },
  message_modal_success_subtitle: {
    ru: 'Все данные были обработаны без ошибок.',
    en: 'All data was processed without errors.',
    fr: 'Toutes les donnees ont ete traitees sans erreur.',
    ar: 'تمت معالجة جميع البيانات بدون أخطاء.',
  },
  message_modal_success_info_title: {
    ru: 'Статус: Успешно',
    en: 'Status: Success',
    fr: 'Statut : Succes',
    ar: 'الحالة: نجاح',
  },
  message_modal_success_info_text: {
    ru: 'Изменения сохранены и уже применены в системе.',
    en: 'Changes have been saved and are already applied in the system.',
    fr: 'Les modifications ont ete enregistrees et appliquees dans le systeme.',
    ar: 'تم حفظ التغييرات وتطبيقها بالفعل في النظام.',
  },
  message_modal_next_steps: {
    ru: 'Что дальше?',
    en: 'What next?',
    fr: 'Quelle est la suite ?',
    ar: 'ما التالي؟',
  },
  message_modal_tip_continue: {
    ru: 'Проверьте результат и продолжайте работу',
    en: 'Check the result and continue working',
    fr: 'Verifiez le resultat et continuez',
    ar: 'تحقق من النتيجة وتابع العمل',
  },
  message_modal_tip_close_return: {
    ru: 'Если нужно — закройте окно и вернитесь к сценарию',
    en: 'If needed, close the window and return to the flow',
    fr: 'Si necessaire, fermez la fenetre et revenez au scenario',
    ar: 'إذا لزم الأمر، أغلق النافذة وعد إلى السيناريو',
  },
  message_modal_tip_auto_refresh: {
    ru: 'При повторной проверке статус обновится автоматически',
    en: 'On the next check, the status will update automatically',
    fr: 'Lors de la prochaine verification, le statut se mettra a jour automatiquement',
    ar: 'عند التحقق التالي، سيتم تحديث الحالة تلقائيًا',
  },
  message_modal_attention_title: {
    ru: 'Требуется дополнительное внимание',
    en: 'Additional attention required',
    fr: 'Attention supplementaire requise',
    ar: 'يتطلب الأمر انتباهًا إضافيًا',
  },
  message_modal_attention_subtitle: {
    ru: 'Система завершила проверку, но нашла данные, которые стоит перепроверить.',
    en: 'The system completed the check but found data that should be reviewed.',
    fr: 'Le systeme a termine la verification mais a trouve des donnees a reverifier.',
    ar: 'أكمل النظام التحقق لكنه وجد بيانات يجب مراجعتها.',
  },
  message_modal_warning_info_title: {
    ru: 'Статус: Предупреждение',
    en: 'Status: Warning',
    fr: 'Statut : Avertissement',
    ar: 'الحالة: تحذير',
  },
  message_modal_warning_info_text: {
    ru: 'Проверьте данные пользователя, чтобы избежать ошибок в работе.',
    en: 'Check the user data to avoid operational errors.',
    fr: 'Verifiez les donnees utilisateur pour eviter des erreurs.',
    ar: 'تحقق من بيانات المستخدم لتجنب الأخطاء أثناء العمل.',
  },
  message_modal_what_to_do: {
    ru: 'Что можно сделать?',
    en: 'What can be done?',
    fr: 'Que peut-on faire ?',
    ar: 'ما الذي يمكن فعله؟',
  },
  message_modal_tip_check_fields: {
    ru: 'Сверьте заполненные поля и прикрепленные данные',
    en: 'Check the filled fields and attached data',
    fr: 'Verifiez les champs remplis et les donnees jointes',
    ar: 'تحقق من الحقول المعبأة والبيانات المرفقة',
  },
  message_modal_tip_retry_after_fix: {
    ru: 'Повторите действие после исправления неточностей',
    en: 'Repeat the action after correcting inaccuracies',
    fr: 'Repetez l action apres avoir corrige les inexactitudes',
    ar: 'أعد الإجراء بعد تصحيح الأخطاء',
  },
  message_modal_tip_contact_support: {
    ru: 'Если предупреждение не исчезает — обратитесь в поддержку',
    en: 'If the warning persists, contact support',
    fr: 'Si l avertissement persiste, contactez le support',
    ar: 'إذا استمر التحذير، فاتصل بالدعم',
  },
  message_modal_fail_title: {
    ru: 'Обнаружена нештатная ситуация',
    en: 'An issue has been detected',
    fr: 'Une situation inhabituelle a ete detectee',
    ar: 'تم اكتشاف حالة غير متوقعة',
  },
  message_modal_fail_subtitle: {
    ru: 'Система выявила расхождение данных при проверке пользователя. Это может повлиять на корректность работы.',
    en: 'The system detected a data mismatch during user verification. This may affect correct operation.',
    fr: 'Le systeme a detecte une incoherence des donnees lors de la verification de l utilisateur.',
    ar: 'اكتشف النظام عدم تطابق في البيانات أثناء التحقق من المستخدم. قد يؤثر ذلك على صحة العمل.',
  },
  message_modal_error_code: {
    ru: 'Код ошибки',
    en: 'Error code',
    fr: 'Error code',
    ar: 'رمز الخطأ',
  },
  message_modal_error_details: {
    ru: 'Сведения об ошибке',
    en: 'Error details',
    fr: 'Details de l erreur',
    ar: 'تفاصيل الخطأ',
  },
  message_modal_fail_info_text: {
    ru: 'Состояние проверки пользователя не соответствует ожидаемому.',
    en: 'The user verification state does not match the expected one.',
    fr: 'L etat de verification de l utilisateur ne correspond pas a celui attendu.',
    ar: 'حالة التحقق من المستخدم لا تطابق الحالة المتوقعة.',
  },
  message_modal_tip_check_user_data: {
    ru: 'Проверьте актуальность данных пользователя',
    en: 'Check whether the user data is up to date',
    fr: 'Verifiez que les donnees utilisateur sont a jour',
    ar: 'تحقق من أن بيانات المستخدم محدثة',
  },
  message_modal_tip_refresh_or_retry: {
    ru: 'Повторите проверку или обновите страницу',
    en: 'Run the check again or refresh the page',
    fr: 'Relancez la verification ou actualisez la page',
    ar: 'أعد التحقق أو حدّث الصفحة',
  },
  message_modal_tip_if_repeat_support: {
    ru: 'Если проблема повторится — обратитесь в поддержку',
    en: 'If the problem repeats, contact support',
    fr: 'Si le probleme se repete, contactez le support',
    ar: 'إذا تكررت المشكلة، فاتصل بالدعم',
  },
  message_modal_done: {
    ru: 'Готово',
    en: 'Done',
    fr: 'Termine',
    ar: 'تم',
  },
  message_modal_retry: {
    ru: 'Повторить проверку',
    en: 'Retry check',
    fr: 'Relancer la verification',
    ar: 'إعادة التحقق',
  },
  message_modal_support: {
    ru: 'Связаться с поддержкой',
    en: 'Contact support',
    fr: 'Contacter le support',
    ar: 'الاتصال بالدعم',
  },
  message_modal_cancel: {
    ru: 'Отмена',
    en: 'Cancel',
    fr: 'Annuler',
    ar: 'إلغاء',
  },
  message_modal_close: {
    ru: 'Закрыть',
    en: 'Close',
    fr: 'Fermer',
    ar: 'إغلاق',
  },
  message_modal_fail_title_simple: {
    ru: 'Не удалось выполнить действие',
    en: 'Could not complete the action',
    fr: 'Impossible d effectuer l action',
    ar: 'تعذر تنفيذ الإجراء',
  },
  message_modal_warning_title_simple: {
    ru: 'Нужно внимание',
    en: 'Attention required',
    fr: 'Attention requise',
    ar: 'يتطلب الانتباه',
  },
  message_modal_reason_title: {
    ru: 'Причина',
    en: 'Reason',
    fr: 'Raison',
    ar: 'السبب',
  },
  message_modal_what_happened_title: {
    ru: 'Что произошло',
    en: 'What happened',
    fr: 'Ce qui s est passe',
    ar: 'ما الذي حدث',
  },
  message_modal_understood: {
    ru: 'Понятно',
    en: 'OK',
    fr: 'OK',
    ar: 'حسنا',
  },
  message_modal_already_actual: {
    ru: 'Данные уже актуальны. Повторное действие не требуется.',
    en: 'The data is already up to date. No repeated action is required.',
    fr: 'Les donnees sont deja a jour. Aucune action repetee n est requise.',
    ar: 'البيانات محدثة بالفعل. لا يلزم تكرار الإجراء.',
  },
  message_modal_warning_default_text: {
    ru: 'Сейчас это действие выполнить нельзя. Проверьте данные и попробуйте еще раз.',
    en: 'This action cannot be completed right now. Check the data and try again.',
    fr: 'Cette action ne peut pas etre effectuee pour le moment. Verifiez les donnees et reessayez.',
    ar: 'لا يمكن تنفيذ هذا الإجراء الآن. تحقق من البيانات وحاول مرة أخرى.',
  },
  message_modal_error_code_english: {
    ru: 'Error code',
    en: 'Error code',
    fr: 'Error code',
    ar: 'Error code',
  },
  api_error_generic: {
    ru: 'Не удалось выполнить действие. Проверьте данные и попробуйте еще раз.',
    en: 'The action could not be completed. Check the details and try again.',
    fr: 'L action n a pas pu etre effectuee. Verifiez les donnees et reessayez.',
    ar: 'تعذر تنفيذ الإجراء. تحقق من البيانات وحاول مرة أخرى.',
  },
  register_done_message: {
    ru: 'Регистрация прошла успешно.',
    en: 'Registration was successful.',
    fr: 'L inscription a reussi.',
    ar: 'تم التسجيل بنجاح.',
  },
  address_not_specified: {
    ru: 'Адрес не указан',
    en: 'Address not specified',
    fr: 'Adresse non indiquée',
    ar: 'العنوان غير محدد',
  },
  calculation_no_data: {
    ru: 'нет данных для расчёта',
    en: 'No calculation data',
    fr: 'Aucune donnée de calcul',
    ar: 'لا توجد بيانات للحساب',
  },
  driver_profit: {
    ru: 'Выгода водителя',
    en: 'Driver profit',
    fr: 'Gain du conducteur',
    ar: 'ربح السائق',
  },
  calculation: {
    ru: 'Расчёт',
    en: 'Calculation',
    fr: 'Calcul',
    ar: 'الحساب',
  },
  approximate_time: {
    ru: 'Ожидаемое время',
    en: 'Estimate time',
    fr: 'Temps estimé',
    ar: 'الوقت المقدر',
  },
  hint_privacy_policy: {
    ru: 'Политика конфиденциальности',
    en: 'Privacy policy',
    fr: 'Politique de confidentialité',
    ar: 'سياسة الخصوصية',
  },
  hint_submit: {
    ru: 'Подтвердить',
    en: 'Submit',
    fr: 'Envoyer',
    ar: 'إرسال',
  },

  client_driver_selected_message: {
    ru: 'Водитель выбран. Он получит уведомление и подъедет к вам.',
    en: 'Driver selected. They will be notified and come to you.',
    fr: 'Chauffeur sélectionné. Il sera prévenu et viendra à vous.',
    ar: 'تم اختيار السائق. سيتم إشعاره وسيأتي إليك.',
  },
  client_driver_select_error: {
    ru: 'Не удалось выбрать водителя. Попробуйте ещё раз.',
    en: 'Could not select the driver. Try again.',
    fr: 'Impossible de choisir le chauffeur. Réessayez.',
    ar: 'تعذر اختيار السائق. حاول مرة أخرى.',
  },
  client_responses_count: {
    ru: 'Отклики',
    en: 'Responses',
    fr: 'Réponses',
    ar: 'الردود',
  },
  client_route: {
    ru: 'Маршрут',
    en: 'Route',
    fr: 'Itinéraire',
    ar: 'المسار',
  },
  client_route_duration: {
    ru: 'В пути',
    en: 'Trip time',
    fr: 'Temps de trajet',
    ar: 'وقت الرحلة',
  },
  client_route_selected: {
    ru: 'Маршрут выбран',
    en: 'Route selected',
    fr: 'Itinéraire sélectionné',
    ar: 'تم اختيار المسار',
  },
  minutes: {
    ru: 'мин',
    en: 'min',
    fr: 'min',
    ar: 'دقيقة',
  },
  hours: {
    ru: 'ч',
    en: 'h',
    fr: 'h',
    ar: 'ساعة',
  },
  client_choose_driver: {
    ru: 'Выберите водителя',
    en: 'Choose a driver',
    fr: 'Choisissez un chauffeur',
    ar: 'اختر السائق',
  },
  client_candidate_hold_hint: {
    ru: 'зажмите карточку для деталей',
    en: 'hold the card for details',
    fr: 'maintenez la carte pour les détails',
    ar: 'اضغط مطولاً على البطاقة للتفاصيل',
  },
  client_voting_title: {
    ru: 'Голосование',
    en: 'Voting',
    fr: 'Vote',
    ar: 'التصويت',
  },
  client_drivers_count_label: {
    ru: 'Водителей',
    en: 'Drivers',
    fr: 'Chauffeurs',
    ar: 'السائقون',
  },
  client_from_driver: {
    ru: 'От водителя',
    en: 'From driver',
    fr: 'Du chauffeur',
    ar: 'من السائق',
  },
  client_voting_eyebrow: {
    ru: 'VOTING — выберите водителя',
    en: 'VOTING — choose a driver',
    fr: 'VOTING — choisissez un chauffeur',
    ar: 'التصويت — اختر السائق',
  },
  client_responded_drivers: {
    ru: 'Откликнулось водителей',
    en: 'Drivers responded',
    fr: 'Chauffeurs ayant répondu',
    ar: 'السائقون الذين ردوا',
  },
  client_waiting_customer: {
    ru: 'Ожидание клиента',
    en: 'Waiting for customer',
    fr: 'En attente du client',
    ar: 'في انتظار العميل',
  },
  client_select_or_wait_more: {
    ru: 'Можно выбрать водителя вручную или подождать ещё',
    en: 'You can choose a driver manually or wait longer',
    fr: 'Vous pouvez choisir un chauffeur manuellement ou attendre encore',
    ar: 'يمكنك اختيار سائق يدويًا أو الانتظار أكثر',
  },
  client_wait_more: {
    ru: 'Жду дальше',
    en: 'Wait more',
    fr: 'Attendre encore',
    ar: 'انتظر أكثر',
  },
  client_nearby_cars: {
    ru: 'автомобилей рядом',
    en: 'cars nearby',
    fr: 'voitures à proximité',
    ar: 'سيارات قريبة',
  },
  driver_offer_comment_direct: {
    ru: 'Еду напрямую',
    en: 'Going directly',
    fr: 'Je viens directement',
    ar: 'أتجه مباشرة',
  },
  driver_offer_comment_fast: {
    ru: 'Могу быстро подъехать',
    en: 'I can arrive quickly',
    fr: 'Je peux arriver rapidement',
    ar: 'يمكنني الوصول بسرعة',
  },
  driver_offer_comment_ac: {
    ru: 'Есть кондиционер',
    en: 'Air conditioning available',
    fr: 'Climatisation disponible',
    ar: 'يوجد مكيف',
  },
  driver_offer_comment_big_trunk: {
    ru: 'Большой багажник',
    en: 'Large trunk',
    fr: 'Grand coffre',
    ar: 'صندوق كبير',
  },
  driver_offer_comment_nearby: {
    ru: 'Свободен рядом',
    en: 'Available nearby',
    fr: 'Disponible à proximité',
    ar: 'متاح بالقرب منك',
  },
  driver_offer_comment_careful: {
    ru: 'Буду аккуратно',
    en: 'I will drive carefully',
    fr: 'Je conduirai prudemment',
    ar: 'سأقود بحذر',
  },
  meter_short: {
    ru: 'м',
    en: 'm',
    fr: 'm',
    ar: 'م',
  },
  kilometer_short: {
    ru: 'км',
    en: 'km',
    fr: 'km',
    ar: 'كم',
  },
  driver: {
    ru: 'Водитель',
    en: 'Driver',
    fr: 'Chauffeur',
    ar: 'السائق',
  },
  rating: {
    ru: 'Рейтинг',
    en: 'Rating',
    fr: 'Note',
    ar: 'التقييم',
  },
  rating_header: {
    ru: 'Рейтинг',
    en: 'Rating',
    fr: 'Note',
    ar: 'التقييم',
  },
  voting: {
    ru: 'Голосование',
    en: 'Voting',
    fr: 'Vote',
    ar: 'التصويت',
  },
  client_no_driver_responses: {
    ru: 'Пока никто из водителей не откликнулся. Заказ остаётся активным.',
    en: 'No drivers have responded yet. The order remains active.',
    fr: 'Aucun chauffeur n a encore répondu. La commande reste active.',
    ar: 'لم يرد أي سائق بعد. يبقى الطلب نشطًا.',
  },
  client_searching_driver: {
    ru: 'Поиск водителя',
    en: 'Searching for a driver',
    fr: 'Recherche d un chauffeur',
    ar: 'جارٍ البحث عن سائق',
  },
  client_searching_driver_subtitle: {
    ru: 'Ищем водителя рядом с вами',
    en: 'Searching for a nearby driver',
    fr: 'Recherche d un chauffeur proche de vous',
    ar: 'نبحث عن سائق قريب منك',
  },
  client_voting_subtitle: {
    ru: 'Водители предлагают условия, выберите подходящего',
    en: 'Drivers are offering terms; choose the best one',
    fr: 'Les chauffeurs proposent leurs conditions; choisissez la meilleure option',
    ar: 'يعرض السائقون الشروط، اختر الأنسب',
  },
  client_driver_on_way_title: {
    ru: 'Водитель едет',
    en: 'Driver is on the way',
    fr: 'Le chauffeur arrive',
    ar: 'السائق في الطريق',
  },
  client_driver_on_way_subtitle: {
    ru: 'Машина едет к точке подачи',
    en: 'The car is heading to the pickup point',
    fr: 'La voiture se dirige vers le point de départ',
    ar: 'السيارة متجهة إلى نقطة الانطلاق',
  },
  client_driver_arrived_title: {
    ru: 'Водитель прибыл',
    en: 'Driver arrived',
    fr: 'Le chauffeur est arrivé',
    ar: 'وصل السائق',
  },
  client_driver_waiting_subtitle: {
    ru: 'Водитель ожидает вас у точки подачи',
    en: 'The driver is waiting for you at the pickup point',
    fr: 'Le chauffeur vous attend au point de départ',
    ar: 'السائق ينتظرك عند نقطة الانطلاق',
  },
  client_driver_arrived_go: {
    ru: 'РџРѕРµС…Р°Р»',
    en: 'Let us go',
    fr: 'On y va',
    ar: 'Щ„Щ†Щ†Ш·Щ„Щ‚',
  },
  client_driver_left_without_code: {
    ru: 'РЈРµС…Р°Р» Р±РµР· РєРѕРґР°',
    en: 'Left without code',
    fr: 'Parti sans code',
    ar: 'ШєШ§ШЇШ± ШЁШЇЩ€Щ† Ш±Щ…ШІ',
  },
  client_driver_left_without_code_reason: {
    ru: 'РљР»РёРµРЅС‚ СѓРµС…Р°Р» Р±РµР· РєРѕРґР° РїРѕСЃР°РґРєРё',
    en: 'Passenger left without boarding code',
    fr: 'Le passager est parti sans code d embarquement',
    ar: 'ШєШ§ШЇШ± Ш§Щ„Ш±Ш§ЩѓШЁ ШЁШЇЩ€Щ† Ш±Щ…ШІ Ш§Щ„ШµШ№Щ€ШЇ',
  },
  client_trip_started_title: {
    ru: 'В пути',
    en: 'On the way',
    fr: 'En route',
    ar: 'في الطريق',
  },
  client_trip_started_subtitle: {
    ru: 'Поездка выполняется, карта остаётся открытой',
    en: 'The trip is in progress and the map remains visible',
    fr: 'Le trajet est en cours et la carte reste visible',
    ar: 'الرحلة جارية والخريطة تبقى ظاهرة',
  },
  client_finish_trip: {
    ru: 'Завершить',
    en: 'Finish',
    fr: 'Terminer',
    ar: 'إنهاء',
  },
  driver_mark_tips: {
    ru: 'Отметить чаевые',
    en: 'Mark tips',
    fr: 'Marquer le pourboire',
    ar: 'تأكيد الإكرامية',
  },
  client_trip_finished_subtitle: {
    ru: 'Поездка завершена',
    en: 'Trip completed',
    fr: 'Trajet terminé',
    ar: 'اكتملت الرحلة',
  },
  completed: {
    ru: 'Завершено',
    en: 'Completed',
    fr: 'Terminé',
    ar: 'مكتمل',
  },
  client_city_order_mode: {
    ru: 'Городская поездка',
    en: 'City trip',
    fr: 'Trajet en ville',
    ar: 'رحلة داخل المدينة',
  },
  client_offer_short_button: {
    ru: 'Предложение',
    en: 'Offer',
    fr: 'Offre',
    ar: 'عرض',
  },
  client_intercity_order_mode: {
    ru: 'Межгородская поездка',
    en: 'Intercity trip',
    fr: 'Trajet interurbain',
    ar: 'رحلة بين المدن',
  },
  client_offer_class_hint: {
    ru: 'Класс авто можно выбрать для ориентира, водитель предложит свои условия.',
    en: 'Choose a car class as a guide; drivers will offer their terms.',
    fr: 'Choisissez une classe de voiture comme repère; les chauffeurs proposeront leurs conditions.',
    ar: 'اختر فئة السيارة كدليل، وسيقدم السائقون عروضهم.',
  },
  client_offer_desired_price_label: {
    ru: 'Желаемая цена',
    en: 'Desired price',
    fr: 'Prix souhaité',
    ar: 'السعر المطلوب',
  },
  client_offer_hint: {
    ru: 'Создайте заказ, и водители смогут предложить цену, время подачи и свободные места.',
    en: 'Create an order, and drivers can offer a price, pickup time, and free seats.',
    fr: 'Créez une commande, et les chauffeurs pourront proposer un prix, une heure d arrivée et des places libres.',
    ar: 'أنشئ الطلب، وسيتمكن السائقون من تقديم السعر ووقت الوصول والمقاعد المتاحة.',
  },
  client_offer_not_fixed_price: {
    ru: 'Цена не фиксирована: водители предложат свои условия.',
    en: 'The price is not fixed: drivers will offer their terms.',
    fr: 'Le prix n est pas fixe: les chauffeurs proposeront leurs conditions.',
    ar: 'السعر غير ثابت: سيقدم السائقون عروضهم.',
  },
  client_offer_order_button: {
    ru: 'Получить предложения',
    en: 'Get offers',
    fr: 'Obtenir des offres',
    ar: 'الحصول على عروض',
  },
  client_estimated_price: {
    ru: 'Расчетная стоимость',
    en: 'Estimated price',
    fr: 'Prix estimé',
    ar: 'السعر التقديري',
  },
  client_pickup_price: {
    ru: 'Сумма на подачу',
    en: 'Pickup amount',
    fr: 'Montant de prise en charge',
    ar: 'مبلغ الوصول',
  },
  client_customer_offer_price: {
    ru: 'Сумма предложения клиента',
    en: 'Customer offer amount',
    fr: 'Montant proposé par le client',
    ar: 'مبلغ عرض العميل',
  },
  client_offer_order_mode: {
    ru: 'Предложение',
    en: 'Offer',
    fr: 'Offre',
    ar: 'عرض',
  },
  client_offer_settings_close: {
    ru: 'Скрыть настройки',
    en: 'Hide settings',
    fr: 'Masquer les paramètres',
    ar: 'إخفاء الإعدادات',
  },
  client_offer_settings_open: {
    ru: 'Настроить',
    en: 'Configure',
    fr: 'Configurer',
    ar: 'ضبط',
  },
  client_offer_title: {
    ru: 'Предложение',
    en: 'Offer',
    fr: 'Offre',
    ar: 'عرض',
  },
  driver_car_wrong_class: {
    ru: 'Класс автомобиля не подходит для этого заказа.',
    en: 'The car class is not suitable for this order.',
    fr: 'La classe de voiture ne convient pas à cette commande.',
    ar: 'فئة السيارة غير مناسبة لهذا الطلب.',
  },
  driver_offer_accepted: {
    ru: 'Предложение принято',
    en: 'Offer accepted',
    fr: 'Offre acceptée',
    ar: 'تم قبول العرض',
  },
  driver_offer_client_comment: {
    ru: 'Комментарий клиента',
    en: 'Client comment',
    fr: 'Commentaire client',
    ar: 'تعليق العميل',
  },
  driver_offer_comment: {
    ru: 'Комментарий',
    en: 'Comment',
    fr: 'Commentaire',
    ar: 'تعليق',
  },
  driver_offer_comment_placeholder: {
    ru: 'Есть кондиционер, большой багажник, еду напрямую',
    en: 'Air conditioning, large trunk, direct route',
    fr: 'Climatisation, grand coffre, trajet direct',
    ar: 'مكيف، صندوق كبير، طريق مباشر',
  },
  driver_offer_comment_save: {
    ru: 'Сохранить комментарий',
    en: 'Save comment',
    fr: 'Enregistrer le commentaire',
    ar: 'حفظ التعليق',
  },
  driver_offer_comment_saved: {
    ru: 'Комментарий сохранён',
    en: 'Comment saved',
    fr: 'Commentaire enregistré',
    ar: 'تم حفظ التعليق',
  },
  driver_offer_desired_price: {
    ru: 'Желаемая цена',
    en: 'Desired price',
    fr: 'Prix souhaité',
    ar: 'السعر المطلوب',
  },
  driver_offer_price_difference: {
    ru: 'Желаемая - расчётная цена',
    en: 'Desired - calculated price',
    fr: 'Prix souhaité - prix calculé',
    ar: 'السعر المطلوب - السعر المحسوب',
  },
  driver_offer_distance: {
    ru: 'Расстояние',
    en: 'Distance',
    fr: 'Distance',
    ar: 'المسافة',
  },
  driver_offer_eta: {
    ru: 'Подача',
    en: 'Pickup time',
    fr: 'Heure d arrivée',
    ar: 'وقت الوصول',
  },
  driver_offer_eta_quick_title: {
    ru: 'Буду через … минут',
    en: 'I will arrive in … minutes',
    fr: 'J arrive dans … minutes',
    ar: 'سأصل خلال … دقيقة',
  },
  driver_offer_more_eta: {
    ru: 'Другое',
    en: 'Other',
    fr: 'Autre',
    ar: 'أخرى',
  },
  driver_offer_eta_5: {
    ru: 'Буду через 5 минут',
    en: 'I will arrive in 5 minutes',
    fr: 'J arrive dans 5 minutes',
    ar: 'سأصل خلال 5 دقائق',
  },
  driver_offer_eta_10: {
    ru: 'Буду через 10 минут',
    en: 'I will arrive in 10 minutes',
    fr: 'J arrive dans 10 minutes',
    ar: 'سأصل خلال 10 دقائق',
  },
  driver_offer_eta_15: {
    ru: 'Буду через 15 минут',
    en: 'I will arrive in 15 minutes',
    fr: 'J arrive dans 15 minutes',
    ar: 'سأصل خلال 15 دقيقة',
  },
  driver_offer_eta_20: {
    ru: 'Буду через 20 минут',
    en: 'I will arrive in 20 minutes',
    fr: 'J arrive dans 20 minutes',
    ar: 'سأصل خلال 20 دقيقة',
  },
  driver_offer_eta_30: {
    ru: 'Буду через 30 минут',
    en: 'I will arrive in 30 minutes',
    fr: 'J arrive dans 30 minutes',
    ar: 'سأصل خلال 30 دقيقة',
  },
  driver_offer_eta_45: {
    ru: 'Буду через 45 минут',
    en: 'I will arrive in 45 minutes',
    fr: 'J arrive dans 45 minutes',
    ar: 'سأصل خلال 45 دقيقة',
  },
  driver_offer_eta_60: {
    ru: 'Выезд через 1 час',
    en: 'Departure in 1 hour',
    fr: 'Départ dans 1 heure',
    ar: 'الانطلاق خلال ساعة',
  },
  driver_offer_eta_90: {
    ru: 'Выезд через 1,5 часа',
    en: 'Departure in 1.5 hours',
    fr: 'Départ dans 1 h 30',
    ar: 'الانطلاق خلال ساعة ونصف',
  },
  driver_offer_eta_120: {
    ru: 'Выезд через 2 часа',
    en: 'Departure in 2 hours',
    fr: 'Départ dans 2 heures',
    ar: 'الانطلاق خلال ساعتين',
  },
  driver_offer_eta_180: {
    ru: 'Выезд через 3 часа',
    en: 'Departure in 3 hours',
    fr: 'Départ dans 3 heures',
    ar: 'الانطلاق خلال 3 ساعات',
  },
  driver_offer_expired: {
    ru: 'Предложение устарело',
    en: 'Offer expired',
    fr: 'Offre expirée',
    ar: 'انتهت صلاحية العرض',
  },
  driver_offer_form_title: {
    ru: 'Предложите свои условия',
    en: 'Offer your terms',
    fr: 'Proposez vos conditions',
    ar: 'قدم شروطك',
  },
  driver_offer_luggage: {
    ru: 'Багаж',
    en: 'Luggage',
    fr: 'Bagages',
    ar: 'الأمتعة',
  },
  driver_offer_no_fake_competition: {
    ru: 'Показываются только реальные отклики водителей.',
    en: 'Only real driver responses are shown.',
    fr: 'Seules les réponses réelles des chauffeurs sont affichées.',
    ar: 'تظهر فقط ردود السائقين الحقيقية.',
  },
  driver_offer_offers_count: {
    ru: 'Откликов',
    en: 'Offers',
    fr: 'Offres',
    ar: 'العروض',
  },
  driver_offer_own_eta: {
    ru: 'Ваша подача',
    en: 'Your pickup time',
    fr: 'Votre heure d arrivée',
    ar: 'وقت وصولك',
  },
  driver_offer_own_price: {
    ru: 'Ваша цена',
    en: 'Your price',
    fr: 'Votre prix',
    ar: 'سعرك',
  },
  driver_offer_passengers: {
    ru: 'Пассажиры',
    en: 'Passengers',
    fr: 'Passagers',
    ar: 'الركاب',
  },
  driver_offer_price: {
    ru: 'Цена',
    en: 'Price',
    fr: 'Prix',
    ar: 'السعر',
  },
  driver_offer_rejected: {
    ru: 'Предложение отклонено',
    en: 'Offer rejected',
    fr: 'Offre rejetée',
    ar: 'تم رفض العرض',
  },
  driver_offer_route: {
    ru: 'Маршрут',
    en: 'Route',
    fr: 'Itinéraire',
    ar: 'المسار',
  },
  driver_offer_seats: {
    ru: 'Свободные места',
    en: 'Free seats',
    fr: 'Places libres',
    ar: 'المقاعد المتاحة',
  },
  driver_offer_send: {
    ru: 'Отправить предложение',
    en: 'Send offer',
    fr: 'Envoyer l offre',
    ar: 'إرسال العرض',
  },
  driver_offer_sent: {
    ru: 'Предложение отправлено',
    en: 'Offer sent',
    fr: 'Offre envoyée',
    ar: 'تم إرسال العرض',
  },
  driver_offer_sent_status: {
    ru: 'Предложение отправлено клиенту.',
    en: 'The offer has been sent to the client.',
    fr: 'L offre a été envoyée au client.',
    ar: 'تم إرسال العرض إلى العميل.',
  },
  driver_offer_cancel_and_hide: {
    ru: 'Отменить и скрыть',
    en: 'Cancel and hide',
    fr: 'Annuler et masquer',
    ar: 'إلغاء وإخفاء',
  },
  driver_offer_cancel_and_hide_confirm: {
    ru: 'Отменить предложение и скрыть заказ?',
    en: 'Cancel the offer and hide the order?',
    fr: 'Annuler l’offre et masquer la commande ?',
    ar: 'هل تريد إلغاء العرض وإخفاء الطلب؟',
  },
  driver_offer_cancelled_hidden: {
    ru: 'Предложение отменено, заказ скрыт.',
    en: 'Offer cancelled, order hidden.',
    fr: 'Offre annulée, commande masquée.',
    ar: 'تم إلغاء العرض وإخفاء الطلب.',
  },
  driver_offer_waiting_client_response: {
    ru: 'Ожидание ответа клиента',
    en: 'Waiting for client response',
    fr: 'En attente de la réponse du client',
    ar: 'بانتظار رد العميل',
  },
  driver_offer_client_selected_you: {
    ru: 'Клиент выбрал вас',
    en: 'The client selected you',
    fr: 'Le client vous a choisi',
    ar: 'اختارك العميل',
  },
  driver_offer_client_selected_other: {
    ru: 'Клиент выбрал другого водителя',
    en: 'The client selected another driver',
    fr: 'Le client a choisi un autre chauffeur',
    ar: 'اختار العميل سائقاً آخر',
  },
  driver_offer_confirm_selection: {
    ru: 'Подтвердить',
    en: 'Confirm',
    fr: 'Confirmer',
    ar: 'تأكيد',
  },
  driver_offer_decline_and_hide: {
    ru: 'Отказаться и скрыть',
    en: 'Decline and hide',
    fr: 'Refuser et masquer',
    ar: 'رفض وإخفاء',
  },
  driver_offer_driver_confirmed: {
    ru: 'Вы подтвердили предложение',
    en: 'You confirmed the offer',
    fr: 'Vous avez confirmé l’offre',
    ar: 'لقد أكدت العرض',
  },
  driver_offer_driver_declined: {
    ru: 'Вы отказались от предложения',
    en: 'You declined the offer',
    fr: 'Vous avez refusé l’offre',
    ar: 'لقد رفضت العرض',
  },
  driver_offer_status: {
    ru: 'Статус',
    en: 'Status',
    fr: 'Statut',
    ar: 'الحالة',
  },
  driver_offer_travel_time: {
    ru: 'Время в пути',
    en: 'Travel time',
    fr: 'Temps de trajet',
    ar: 'وقت الرحلة',
  },
}

function getLanguageInfo() {
  try {
    return configSelectors.language(store.getState())
  } catch (error) {
    return undefined
  }
}

function getFallbackText(key: string, language?: { iso?: string, id?: string | number }) {
  const iso = language?.iso?.toLowerCase() || 'ru'
  const dictionary = FALLBACK_TRANSLATIONS[key]

  if (dictionary)
    return dictionary[iso] || dictionary.en || dictionary.ru

  return key
    .replace(/_p$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, char => char.toUpperCase())
}

function normalizeProjectText(key: string, result: string, language?: { iso?: string } | null) {
  const iso = language?.iso?.toLowerCase() || 'ru'
  const isRussian = iso === 'ru'
  const localDictionary = FALLBACK_TRANSLATIONS[key]

  // Bundled translations are the safe fallback source for project UI.
  // Backend/window.data can be stale or have mismatched keys, so when a key
  // exists in the bundled dictionary we always prefer it and use window.data
  // only for keys that are not bundled here.
  if (localDictionary)
    return localDictionary[iso] || localDictionary.en || localDictionary.ru || result

  const intercityButtonKeys = new Set([
    'client_intercity_order_mode',
  ])

  if (isRussian && intercityButtonKeys.has(key) && result.trim().toLowerCase() === 'предложение')
    return 'Межгородская поездка'

  return result
}

function applyOptions(result: string, options: IOptions) {
  if (options.toLower)
    return result.toLowerCase()

  if (options.toUpper)
    return result.toUpperCase()

  return result
}

/**
 * Gets localized text
 *
 * @param id CATEGORY.KEY or just KEY. Default category is lang_vls
 * @param options Result text modificators
 */
function t(id: string, options: IOptions = {}) {
  const language = getLanguageInfo()

  try {
    const splittedID = id.split('.')

    const category = splittedID.length === 2 ?
      splittedID[0] :
      CATEGORIES.LANG_VLS
    const key = splittedID[splittedID.length - 1]

    let result = ''

    if (category === CATEGORIES.BOOKING_DRIVER_STATES && key === '1') {
      const consideringText = language?.iso === 'en' ?
        'Searching for a driver' :
        'Поиск водителя'
      return applyOptions(consideringText, options)
    }

    const _data = (window as any).data

    if (!_data)
      return applyOptions(normalizeProjectText(key, getFallbackText(key, language), language), options)

    const possibleCategories: string[] = Object.values(CATEGORIES)
    const languageId = language?.id
    const languageIso = language?.iso

    if (category === CATEGORIES.LANG_VLS) {
      const values = _data?.[category]?.[key]
      result = values?.[languageId as any] ||
        values?.[languageIso as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else if (category === CATEGORIES.BOOKING_DRIVER_STATES && key === '0') {
      const values = _data?.lang_vls?.search
      result = values?.[languageId as any] ||
        values?.[languageIso as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else if (possibleCategories.includes(category)) {
      const values = _data?.[category]?.[key]
      result = values?.[languageIso as any] ||
        values?.[languageId as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else {
      throw new Error(`Unknown category ${category}`)
    }

    if (!result)
      result = getFallbackText(key, language)

    return applyOptions(normalizeProjectText(key, result, language), options)
  } catch (error) {
    if (!errorsShown.has(id)) {
      console.warn(
        `Localization fallback used. id: ${id}, options: ${JSON.stringify(options)}`,
        error,
      )
      errorsShown.add(id)
    }

    const key = id.split('.').pop() || id
    return applyOptions(normalizeProjectText(key, getFallbackText(key, language), language), options)
  }
}

// TODO get back

// const castedTranslation = T as any

export {
  t,
  TRANSLATION,
}

const errorsShown = new Set<string>()
