export const MANIFEST_URL = "https://mania-editor.noahcraft01.workers.dev/desktop/latest.json";
export const SLUG = "download";

export const CONTENT = {
  en: {
    navLabel: "Download",
    title: "Download Cascade for Windows, macOS and Linux | osu!mania Editor",
    description:
      "Download Cascade for Windows, macOS and Linux. The same osu!mania, StepMania and Etterna editor, in its own window and working offline.",
    keywords:
      "cascade download, osu!mania editor download, mania editor for windows, osu mania editor mac, mania editor linux, osu mania desktop app, stepmania editor download, vsrg editor",
    ogTitle: "Cascade for desktop",
    ogDescription:
      "The osu!mania editor as a desktop app for Windows, macOS and Linux.",
    h1: "Cascade for desktop",
    lead: "Edit your maps offline in a separate window.",
    specs: "Windows, macOS and Linux · 64-bit",
    platforms: {
      windows: { name: "Windows", specs: "Windows 10 and 11 · 64-bit" },
      macos: { name: "macOS", specs: "macOS 11 or newer · Intel and Apple Silicon" },
      linux: { name: "Linux", specs: "64-bit · AppImage, deb or rpm" },
    },
    versionPending: "Latest build",
    releasedLabel: "Released {date}",
    cards: {
      setup: {
        name: "Installer",
        kind: ".exe",
        text: "Installs Cascade and adds it to your Start menu.",
        cta: "Download installer",
      },
      msi: {
        name: "MSI package",
        kind: ".msi",
        text: "For deployment through Windows Installer.",
        cta: "Download MSI",
      },
      portable: {
        name: "Portable",
        kind: ".exe",
        text: "Run it from any folder. No installation needed.",
        cta: "Download portable",
      },
      dmg: {
        name: "Disk image",
        kind: ".dmg",
        text: "One universal build for Intel and Apple Silicon.",
        cta: "Download disk image",
      },
      appimage: {
        name: "AppImage",
        kind: ".AppImage",
        text: "Runs on most distributions without installing anything.",
        cta: "Download AppImage",
      },
      deb: {
        name: "Debian package",
        kind: ".deb",
        text: "For Debian, Ubuntu and derivatives.",
        cta: "Download deb",
      },
      rpm: {
        name: "RPM package",
        kind: ".rpm",
        text: "For Fedora, openSUSE and derivatives.",
        cta: "Download rpm",
      },
    },
    notesTitle: "Before you install",
    notes: [
      {
        name: "Windows SmartScreen",
        text: "The builds are not code-signed yet, so SmartScreen shows “Windows protected your PC”. Choose More info, then Run anyway.",
      },
      {
        name: "WebView2",
        text: "The installers fetch Microsoft’s WebView2 runtime when it is missing. Windows 11 already has it, and the portable exe needs it too.",
      },
      {
        name: "macOS Gatekeeper",
        text: "The macOS build is not signed by Apple yet, so the first launch is blocked. Right-click Cascade in Applications and choose Open, or allow it under System Settings, Privacy and Security.",
      },
      {
        name: "Running the AppImage",
        text: "Mark it executable with chmod +x before the first run. The deb and rpm packages install the usual way.",
      },
      {
        name: "osu! integration",
        text: "Reading the map currently open in osu! works on Windows only. Everything else in the editor behaves the same on all three systems.",
      },
      {
        name: "Updating",
        text: "Cascade checks for updates when it starts and installs them in one click, with a quick restart. You only need this page for the first install.",
      },
    ],
    showcaseTitle: "A look inside",
    showcaseLead:
      "Everything the browser editor does, in its own window, plus a direct line to your osu! install.",
    showcase: {
      editor: {
        alt: "The Cascade editor with a 7K map loaded",
        text: "Chart 1K to 18K on a canvas playfield, with live map stats, star rating and a max-pp readout while you work.",
      },
      playtest: {
        alt: "Playtest mode showing judgements and an unstable rate bar",
        text: "Press F5 to play what you just wrote. Judgements, combo, accuracy, a live NPS graph and an unstable rate bar.",
      },
      sv: {
        alt: "The scroll velocity editor with a live curve preview",
        text: "Generate constant, curve or stutter scroll velocity across a range, previewed the way osu!mania actually plays it.",
      },
    },
    showcaseCta: "Download Cascade",
    webTitle: "Prefer the browser?",
    webCta: "Open the web editor",
    browserLink: "Open in browser",
    noticeError:
      "The download server is not reachable right now. Try refreshing in a moment.",
    noticeEmpty: "No desktop build is published yet. Check back soon.",
    noticeOther:
      "We could not tell which system you are on. Pick the build that matches it, or use the browser version.",
    privacyLink: "Privacy policy",
  },

  de: {
    navLabel: "Herunterladen",
    title: "Cascade für Windows, macOS und Linux herunterladen | osu!mania-Editor",
    description:
      "Lade Cascade für Windows, macOS und Linux herunter. Derselbe Editor für osu!mania, StepMania und Etterna, im eigenen Fenster und offline nutzbar.",
    keywords:
      "cascade download, osu!mania editor herunterladen, mania editor windows, osu mania editor mac, mania editor linux, osu mania desktop app, stepmania editor download, vsrg editor",
    ogTitle: "Cascade für den Desktop",
    ogDescription:
      "Der osu!mania-Editor als Desktop-App für Windows, macOS und Linux.",
    h1: "Cascade für den Desktop",
    lead: "Bearbeite deine Maps offline in einem eigenen Fenster.",
    specs: "Windows, macOS und Linux · 64-Bit",
    platforms: {
      windows: { name: "Windows", specs: "Windows 10 und 11 · 64-Bit" },
      macos: { name: "macOS", specs: "macOS 11 oder neuer · Intel und Apple Silicon" },
      linux: { name: "Linux", specs: "64-Bit · AppImage, deb oder rpm" },
    },
    versionPending: "Neuester Build",
    releasedLabel: "Veröffentlicht am {date}",
    cards: {
      setup: {
        name: "Installer",
        kind: ".exe",
        text: "Installiert Cascade und legt einen Eintrag im Startmenü an.",
        cta: "Installer laden",
      },
      msi: {
        name: "MSI-Paket",
        kind: ".msi",
        text: "Für die Verteilung über Windows Installer.",
        cta: "MSI laden",
      },
      portable: {
        name: "Portable Version",
        kind: ".exe",
        text: "Aus einem beliebigen Ordner starten, ohne Installation.",
        cta: "Portable laden",
      },
      dmg: {
        name: "Disk-Image",
        kind: ".dmg",
        text: "Ein universeller Build für Intel und Apple Silicon.",
        cta: "Disk-Image laden",
      },
      appimage: {
        name: "AppImage",
        kind: ".AppImage",
        text: "Läuft auf den meisten Distributionen ganz ohne Installation.",
        cta: "AppImage laden",
      },
      deb: {
        name: "Debian-Paket",
        kind: ".deb",
        text: "Für Debian, Ubuntu und Abkömmlinge.",
        cta: "deb laden",
      },
      rpm: {
        name: "RPM-Paket",
        kind: ".rpm",
        text: "Für Fedora, openSUSE und Abkömmlinge.",
        cta: "rpm laden",
      },
    },
    notesTitle: "Vor dem Installieren",
    notes: [
      {
        name: "Windows SmartScreen",
        text: "Die Builds sind noch nicht signiert, deshalb zeigt SmartScreen „Der Computer wurde durch Windows geschützt“. Wähl Weitere Informationen und dann Trotzdem ausführen.",
      },
      {
        name: "WebView2",
        text: "Die Installer laden Microsofts WebView2-Runtime nach, falls sie fehlt. Windows 11 bringt sie schon mit, und die portable EXE braucht sie ebenfalls.",
      },
      {
        name: "macOS Gatekeeper",
        text: "Der macOS-Build ist noch nicht von Apple signiert, deshalb wird der erste Start blockiert. Klick Cascade im Programme-Ordner mit rechts an und wähl Öffnen, oder erlaub es unter Systemeinstellungen, Datenschutz und Sicherheit.",
      },
      {
        name: "AppImage starten",
        text: "Mach es vor dem ersten Start mit chmod +x ausführbar. Die deb- und rpm-Pakete installierst du wie gewohnt.",
      },
      {
        name: "osu!-Integration",
        text: "Die gerade in osu! geöffnete Map auszulesen funktioniert nur unter Windows. Alles andere im Editor verhält sich auf allen drei Systemen gleich.",
      },
      {
        name: "Aktualisieren",
        text: "Cascade sucht beim Start nach Updates und installiert sie mit einem Klick und einem kurzen Neustart. Diese Seite brauchst du nur für die erste Installation.",
      },
    ],
    showcaseTitle: "Ein Blick hinein",
    showcaseLead:
      "Alles, was der Browser-Editor kann, in einem eigenen Fenster und mit direktem Draht zu deiner osu!-Installation.",
    showcase: {
      editor: {
        alt: "Der Cascade-Editor mit einer geladenen 7K-Map",
        text: "Mappe von 1K bis 18K auf einem Canvas-Playfield, mit Live-Statistiken, Star-Rating und max-pp-Anzeige beim Arbeiten.",
      },
      playtest: {
        alt: "Playtest-Modus mit Judgements und Unstable-Rate-Leiste",
        text: "Mit F5 spielst du, was du gerade geschrieben hast. Judgements, Combo, Genauigkeit, NPS-Graph und Unstable Rate.",
      },
      sv: {
        alt: "Der SV-Editor mit Live-Vorschau der Kurve",
        text: "Erzeuge konstante, Kurven- oder Stutter-SV über einen Bereich, in der Vorschau so, wie osu!mania es wirklich abspielt.",
      },
    },
    showcaseCta: "Cascade herunterladen",
    webTitle: "Lieber im Browser?",
    webCta: "Editor im Browser öffnen",
    browserLink: "Im Browser öffnen",
    noticeError:
      "Der Download-Server ist gerade nicht erreichbar. Versuch es gleich noch mal.",
    noticeEmpty: "Es ist noch kein Desktop-Build veröffentlicht. Schau bald wieder vorbei.",
    noticeOther:
      "Wir konnten dein System nicht erkennen. Wähl den passenden Build aus, oder nimm die Browser-Version.",
    privacyLink: "Datenschutzerklärung",
  },

  ru: {
    navLabel: "Скачать",
    title: "Скачать Cascade для Windows, macOS и Linux | редактор osu!mania",
    description:
      "Десктопное приложение Cascade для Windows, macOS и Linux. Тот же редактор osu!mania, StepMania и Etterna, в отдельном окне и с работой офлайн.",
    keywords:
      "cascade скачать, редактор osu!mania скачать, mania редактор windows, osu mania редактор mac, mania редактор linux, osu mania десктоп, stepmania редактор скачать, vsrg редактор",
    ogTitle: "Cascade для десктопа",
    ogDescription:
      "Редактор osu!mania как десктопное приложение для Windows, macOS и Linux.",
    h1: "Cascade для десктопа",
    lead: "Редактируй карты офлайн в отдельном окне.",
    specs: "Windows, macOS и Linux · 64 бита",
    platforms: {
      windows: { name: "Windows", specs: "Windows 10 и 11 · 64 бита" },
      macos: { name: "macOS", specs: "macOS 11 или новее · Intel и Apple Silicon" },
      linux: { name: "Linux", specs: "64 бита · AppImage, deb или rpm" },
    },
    versionPending: "Последняя сборка",
    releasedLabel: "Опубликовано {date}",
    cards: {
      setup: {
        name: "Установщик",
        kind: ".exe",
        text: "Устанавливает Cascade и добавляет его в меню «Пуск».",
        cta: "Скачать установщик",
      },
      msi: {
        name: "Пакет MSI",
        kind: ".msi",
        text: "Для развёртывания через Windows Installer.",
        cta: "Скачать MSI",
      },
      portable: {
        name: "Портативная версия",
        kind: ".exe",
        text: "Запускай из любой папки, без установки.",
        cta: "Скачать портативную",
      },
      dmg: {
        name: "Образ диска",
        kind: ".dmg",
        text: "Одна универсальная сборка для Intel и Apple Silicon.",
        cta: "Скачать образ диска",
      },
      appimage: {
        name: "AppImage",
        kind: ".AppImage",
        text: "Работает в большинстве дистрибутивов без установки.",
        cta: "Скачать AppImage",
      },
      deb: {
        name: "Пакет Debian",
        kind: ".deb",
        text: "Для Debian, Ubuntu и производных.",
        cta: "Скачать deb",
      },
      rpm: {
        name: "Пакет RPM",
        kind: ".rpm",
        text: "Для Fedora, openSUSE и производных.",
        cta: "Скачать rpm",
      },
    },
    notesTitle: "Перед установкой",
    notes: [
      {
        name: "Windows SmartScreen",
        text: "Сборки пока без подписи, поэтому SmartScreen показывает «Система Windows защитила ваш компьютер». Нажми «Подробнее», затем «Выполнить в любом случае».",
      },
      {
        name: "WebView2",
        text: "Установщики докачивают среду WebView2 от Microsoft, если её нет. В Windows 11 она уже есть, и портативному exe она тоже нужна.",
      },
      {
        name: "macOS Gatekeeper",
        text: "Сборка для macOS пока не подписана Apple, поэтому первый запуск блокируется. Нажми на Cascade в «Программах» правой кнопкой и выбери «Открыть», либо разреши запуск в «Системных настройках», раздел «Конфиденциальность и безопасность».",
      },
      {
        name: "Запуск AppImage",
        text: "Перед первым запуском сделай файл исполняемым командой chmod +x. Пакеты deb и rpm ставятся обычным способом.",
      },
      {
        name: "Интеграция с osu!",
        text: "Чтение карты, открытой в osu!, работает только в Windows. Всё остальное в редакторе одинаково на всех трёх системах.",
      },
      {
        name: "Обновление",
        text: "Cascade проверяет обновления при запуске и ставит их в один клик с быстрым перезапуском. Эта страница нужна только для первой установки.",
      },
    ],
    showcaseTitle: "Взгляд изнутри",
    showcaseLead:
      "Всё, что умеет браузерный редактор, в отдельном окне и с прямым доступом к вашей установке osu!.",
    showcase: {
      editor: {
        alt: "Редактор Cascade с загруженной 7K-картой",
        text: "Стройте карты от 1K до 18K на canvas-поле, со статистикой, star rating и максимальным pp прямо во время работы.",
      },
      playtest: {
        alt: "Режим плейтеста с оценками и полосой unstable rate",
        text: "Нажмите F5 и сыграйте то, что только что написали. Оценки, комбо, точность, график NPS и unstable rate.",
      },
      sv: {
        alt: "Редактор SV с живым предпросмотром кривой",
        text: "Создавайте постоянный, плавный или stutter SV на участке, с предпросмотром так, как это играет osu!mania.",
      },
    },
    showcaseCta: "Скачать Cascade",
    webTitle: "Лучше в браузере?",
    webCta: "Открыть редактор в браузере",
    browserLink: "Открыть в браузере",
    noticeError:
      "Сервер загрузок сейчас недоступен. Попробуй обновить страницу через минуту.",
    noticeEmpty: "Десктопных сборок пока нет. Загляни немного позже.",
    noticeOther:
      "Не удалось определить твою систему. Выбери подходящую сборку или открой версию в браузере.",
    privacyLink: "Политика конфиденциальности",
  },

  "zh-CN": {
    navLabel: "下载",
    title: "下载 Windows、macOS 与 Linux 版 Cascade | osu!mania 编辑器",
    description:
      "下载 Windows、macOS 与 Linux 版 Cascade。与网页版相同的 osu!mania、StepMania 和 Etterna 编辑器，独立窗口，支持离线使用。",
    keywords:
      "cascade 下载, osu!mania 编辑器下载, mania 编辑器 windows, osu mania 编辑器 mac, mania 编辑器 linux, osu mania 桌面版, stepmania 编辑器下载, vsrg 编辑器",
    ogTitle: "Cascade 桌面版",
    ogDescription:
      "osu!mania 编辑器的桌面版，支持 Windows、macOS 与 Linux。",
    h1: "Cascade 桌面版",
    lead: "在独立窗口中离线编辑谱面。",
    specs: "Windows、macOS 与 Linux · 64 位",
    platforms: {
      windows: { name: "Windows", specs: "Windows 10 与 11 · 64 位" },
      macos: { name: "macOS", specs: "macOS 11 或更新版本 · Intel 与 Apple Silicon" },
      linux: { name: "Linux", specs: "64 位 · AppImage、deb 或 rpm" },
    },
    versionPending: "最新版本",
    releasedLabel: "发布于 {date}",
    cards: {
      setup: {
        name: "安装程序",
        kind: ".exe",
        text: "安装 Cascade 并添加到开始菜单。",
        cta: "下载安装程序",
      },
      msi: {
        name: "MSI 安装包",
        kind: ".msi",
        text: "用于通过 Windows Installer 部署。",
        cta: "下载 MSI",
      },
      portable: {
        name: "便携版",
        kind: ".exe",
        text: "从任意文件夹直接运行，无需安装。",
        cta: "下载便携版",
      },
      dmg: {
        name: "磁盘映像",
        kind: ".dmg",
        text: "同时适用于 Intel 与 Apple Silicon 的通用版本。",
        cta: "下载磁盘映像",
      },
      appimage: {
        name: "AppImage",
        kind: ".AppImage",
        text: "在大多数发行版上直接运行，无需安装。",
        cta: "下载 AppImage",
      },
      deb: {
        name: "Debian 软件包",
        kind: ".deb",
        text: "适用于 Debian、Ubuntu 及其衍生版。",
        cta: "下载 deb",
      },
      rpm: {
        name: "RPM 软件包",
        kind: ".rpm",
        text: "适用于 Fedora、openSUSE 及其衍生版。",
        cta: "下载 rpm",
      },
    },
    notesTitle: "安装之前",
    notes: [
      {
        name: "Windows SmartScreen",
        text: "构建还没有代码签名，所以 SmartScreen 会显示“Windows 已保护你的电脑”。点击“更多信息”，再点“仍要运行”。",
      },
      {
        name: "WebView2",
        text: "缺少时安装程序会自动获取微软的 WebView2 运行时。Windows 11 自带，便携版 exe 同样需要它。",
      },
      {
        name: "macOS Gatekeeper",
        text: "macOS 版尚未经过 Apple 签名，首次启动会被拦截。请在“应用程序”中右键点击 Cascade 并选择“打开”，或在“系统设置”的“隐私与安全性”中允许运行。",
      },
      {
        name: "运行 AppImage",
        text: "首次运行前先用 chmod +x 赋予可执行权限。deb 与 rpm 包按常规方式安装即可。",
      },
      {
        name: "osu! 集成",
        text: "读取 osu! 中当前打开的谱面仅支持 Windows。编辑器的其他功能在三个系统上完全一致。",
      },
      {
        name: "更新",
        text: "Cascade 启动时会检查更新，一键安装并快速重启。这个页面只在首次安装时需要。",
      },
    ],
    showcaseTitle: "内部一览",
    showcaseLead: "浏览器编辑器的全部功能，装进独立窗口，并直连你的 osu! 安装目录。",
    showcase: {
      editor: {
        alt: "载入 7K 谱面的 Cascade 编辑器",
        text: "在 canvas 判定区上编写 1K 到 18K 谱面，实时显示谱面统计、星级与最大 pp。",
      },
      playtest: {
        alt: "带判定与 unstable rate 条的试玩模式",
        text: "按 F5 立刻试玩刚写好的段落。判定、连击、准确率、实时 NPS 图表与 unstable rate 条一应俱全。",
      },
      sv: {
        alt: "带实时曲线预览的 SV 编辑器",
        text: "在选定范围内生成恒定、曲线或 stutter SV，并按 osu!mania 的真实表现预览效果。",
      },
    },
    showcaseCta: "下载 Cascade",
    webTitle: "更想用浏览器？",
    webCta: "打开网页版编辑器",
    browserLink: "在浏览器中打开",
    noticeError: "现在连不上下载服务器，稍后刷新页面再试。",
    noticeEmpty: "还没有发布桌面版，过一阵子再来看看。",
    noticeOther:
      "无法识别你的系统。请选择对应的版本，或者直接使用浏览器版。",
    privacyLink: "隐私政策",
  },

  "pt-BR": {
    navLabel: "Baixar",
    title: "Baixar o Cascade para Windows, macOS e Linux | Editor de osu!mania",
    description:
      "Baixe o Cascade para Windows, macOS e Linux. O mesmo editor de osu!mania, StepMania e Etterna, em uma janela própria e funcionando offline.",
    keywords:
      "cascade download, editor de osu!mania download, editor mania windows, editor osu mania mac, editor mania linux, osu mania app desktop, editor stepmania download, editor vsrg",
    ogTitle: "Cascade para desktop",
    ogDescription:
      "O editor de osu!mania como app de desktop para Windows, macOS e Linux.",
    h1: "Cascade para desktop",
    lead: "Edite seus mapas offline em uma janela própria.",
    specs: "Windows, macOS e Linux · 64 bits",
    platforms: {
      windows: { name: "Windows", specs: "Windows 10 e 11 · 64 bits" },
      macos: { name: "macOS", specs: "macOS 11 ou mais recente · Intel e Apple Silicon" },
      linux: { name: "Linux", specs: "64 bits · AppImage, deb ou rpm" },
    },
    versionPending: "Versão mais recente",
    releasedLabel: "Publicado em {date}",
    cards: {
      setup: {
        name: "Instalador",
        kind: ".exe",
        text: "Instala o Cascade e adiciona ao menu Iniciar.",
        cta: "Baixar instalador",
      },
      msi: {
        name: "Pacote MSI",
        kind: ".msi",
        text: "Para distribuição pelo Windows Installer.",
        cta: "Baixar MSI",
      },
      portable: {
        name: "Portátil",
        kind: ".exe",
        text: "Execute de qualquer pasta, sem instalar.",
        cta: "Baixar portátil",
      },
      dmg: {
        name: "Imagem de disco",
        kind: ".dmg",
        text: "Uma versão universal para Intel e Apple Silicon.",
        cta: "Baixar imagem de disco",
      },
      appimage: {
        name: "AppImage",
        kind: ".AppImage",
        text: "Roda na maioria das distribuições sem instalar nada.",
        cta: "Baixar AppImage",
      },
      deb: {
        name: "Pacote Debian",
        kind: ".deb",
        text: "Para Debian, Ubuntu e derivados.",
        cta: "Baixar deb",
      },
      rpm: {
        name: "Pacote RPM",
        kind: ".rpm",
        text: "Para Fedora, openSUSE e derivados.",
        cta: "Baixar rpm",
      },
    },
    notesTitle: "Antes de instalar",
    notes: [
      {
        name: "Windows SmartScreen",
        text: "As builds ainda não são assinadas, então o SmartScreen mostra “O Windows protegeu o seu PC”. Clique em Mais informações e depois em Executar assim mesmo.",
      },
      {
        name: "WebView2",
        text: "Os instaladores baixam o runtime WebView2 da Microsoft quando ele não está presente. O Windows 11 já tem, e o exe portátil também precisa dele.",
      },
      {
        name: "Gatekeeper do macOS",
        text: "A versão para macOS ainda não é assinada pela Apple, então a primeira abertura é bloqueada. Clique com o botão direito no Cascade em Aplicativos e escolha Abrir, ou libere em Ajustes do Sistema, Privacidade e Segurança.",
      },
      {
        name: "Rodando o AppImage",
        text: "Marque como executável com chmod +x antes da primeira execução. Os pacotes deb e rpm instalam do jeito normal.",
      },
      {
        name: "Integração com o osu!",
        text: "Ler o mapa aberto no osu! funciona só no Windows. Todo o resto do editor se comporta igual nos três sistemas.",
      },
      {
        name: "Atualizar",
        text: "O Cascade procura atualizações ao abrir e instala com um clique e um reinício rápido. Você só precisa desta página para a primeira instalação.",
      },
    ],
    showcaseTitle: "Uma olhada por dentro",
    showcaseLead:
      "Tudo o que o editor no navegador faz, em uma janela própria e com acesso direto à sua instalação do osu!.",
    showcase: {
      editor: {
        alt: "O editor do Cascade com um mapa 7K carregado",
        text: "Monte mapas de 1K a 18K em um playfield em canvas, com estatísticas, star rating e pp máximo enquanto você trabalha.",
      },
      playtest: {
        alt: "Modo playtest com julgamentos e barra de unstable rate",
        text: "Aperte F5 e jogue o que acabou de escrever. Julgamentos, combo, precisão, gráfico de NPS ao vivo e unstable rate.",
      },
      sv: {
        alt: "O editor de SV com prévia da curva ao vivo",
        text: "Gere SV constante, em curva ou stutter num trecho, com prévia do jeito que o osu!mania realmente reproduz.",
      },
    },
    showcaseCta: "Baixar o Cascade",
    webTitle: "Prefere o navegador?",
    webCta: "Abrir o editor no navegador",
    browserLink: "Abrir no navegador",
    noticeError:
      "O servidor de download está fora do ar agora. Tente atualizar a página em instantes.",
    noticeEmpty: "Nenhuma build de desktop foi publicada ainda. Volte a conferir em breve.",
    noticeOther:
      "Não conseguimos identificar seu sistema. Escolha a versão correspondente ou use a versão no navegador.",
    privacyLink: "Política de privacidade",
  },
};
