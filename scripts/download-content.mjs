export const MANIFEST_URL = "https://mania-editor.noahcraft01.workers.dev/desktop/latest.json";
export const SLUG = "download";

export const CONTENT = {
  en: {
    navLabel: "Download for Windows",
    title: "Download Cascade for Windows | osu!mania Editor",
    description:
      "Get the Cascade desktop app for Windows. Installer, MSI package or a single portable exe. The same osu!mania, StepMania and Etterna editor, in its own window and working offline.",
    keywords:
      "cascade download, osu!mania editor download, mania editor for windows, osu mania desktop app, stepmania editor download, vsrg editor windows",
    ogTitle: "Cascade for Windows",
    ogDescription:
      "The osu!mania editor as a desktop app. Installer, MSI or portable exe, all 64-bit Windows.",
    eyebrow: "Windows desktop app",
    h1: "Cascade, on your desktop",
    lead: "The same editor you already use in the browser, in a window of its own. Every keystroke goes to the playfield, your maps sit on your machine, and it keeps working when the connection does not.",
    specs: "Windows 10 and 11 · 64-bit",
    versionPending: "Latest build",
    releasedLabel: "Released {date}",
    recommended: "Recommended",
    cards: {
      setup: {
        name: "Installer",
        kind: ".exe installer",
        text: "Sets Cascade up for your user account and puts it in the Start menu. Pick this one if you are not sure.",
        cta: "Download installer",
      },
      msi: {
        name: "MSI package",
        kind: ".msi package",
        text: "The same app as a Windows Installer package, for machines that roll software out through MSI.",
        cta: "Download MSI",
      },
      portable: {
        name: "Portable",
        kind: "portable .exe",
        text: "One executable, no installer, nothing written to Program Files. Run it from a folder or a USB stick.",
        cta: "Download portable",
      },
    },
    featuresTitle: "What the desktop app adds",
    features: [
      {
        name: "A window of its own",
        text: "No tabs, no browser shortcuts stealing your keys. Every hotkey lands in the editor.",
      },
      {
        name: "Works offline",
        text: "The editor ships inside the app. Open it on a plane and keep charting.",
      },
      {
        name: "Same account, same maps",
        text: "Sign in with osu! and your cloud maps, collabs and comments follow you between the browser and the desktop.",
      },
      {
        name: "More room to chart",
        text: "Without browser chrome eating the top of the screen, the playfield gets the space back.",
      },
    ],
    notesTitle: "Before you install",
    notes: [
      {
        name: "Windows will warn you once",
        text: "The builds are not code-signed yet, so SmartScreen shows “Windows protected your PC”. Choose More info, then Run anyway.",
      },
      {
        name: "WebView2 comes along",
        text: "The installers fetch Microsoft’s WebView2 runtime when it is missing. Windows 11 already has it, and the portable exe needs it too.",
      },
      {
        name: "Updating",
        text: "Download the newer build and run it over the old one. Your settings and local maps stay where they are.",
      },
      {
        name: "macOS and Linux",
        text: "Not yet. Until then Cascade runs in any current browser on those systems.",
      },
    ],
    webTitle: "Not on Windows?",
    webLead:
      "Cascade runs in any modern browser with the same editor, the same cloud maps and nothing to install.",
    webCta: "Open the web editor",
    browserLink: "Open in browser",
    noticeError:
      "The download server is not reachable right now. Try refreshing in a moment.",
    noticeEmpty: "No desktop build is published yet. Check back soon.",
    noticeOther:
      "You are not on Windows. The desktop app is Windows-only for now, but the browser version works everywhere.",
  },

  de: {
    navLabel: "Für Windows herunterladen",
    title: "Cascade für Windows herunterladen | osu!mania-Editor",
    description:
      "Hol dir die Cascade-Desktop-App für Windows. Installer, MSI-Paket oder eine einzelne portable EXE. Derselbe Editor für osu!mania, StepMania und Etterna, in einem eigenen Fenster und offline nutzbar.",
    keywords:
      "cascade download, osu!mania editor herunterladen, mania editor windows, osu mania desktop app, stepmania editor download, vsrg editor windows",
    ogTitle: "Cascade für Windows",
    ogDescription:
      "Der osu!mania-Editor als Desktop-App. Installer, MSI oder portable EXE, alles für 64-Bit-Windows.",
    eyebrow: "Windows-Desktop-App",
    h1: "Cascade auf deinem Desktop",
    lead: "Derselbe Editor wie im Browser, nur in einem eigenen Fenster. Jeder Tastendruck landet im Playfield, deine Maps liegen auf deinem Rechner, und der Editor läuft weiter, wenn die Verbindung mal weg ist.",
    specs: "Windows 10 und 11 · 64-Bit",
    versionPending: "Neuester Build",
    releasedLabel: "Veröffentlicht am {date}",
    recommended: "Empfohlen",
    cards: {
      setup: {
        name: "Installer",
        kind: ".exe-Installer",
        text: "Richtet Cascade für dein Benutzerkonto ein und legt einen Eintrag im Startmenü an. Nimm den hier, wenn du unsicher bist.",
        cta: "Installer laden",
      },
      msi: {
        name: "MSI-Paket",
        kind: ".msi-Paket",
        text: "Dieselbe App als Windows-Installer-Paket, für Rechner, die Software über MSI verteilen.",
        cta: "MSI laden",
      },
      portable: {
        name: "Portable Version",
        kind: "portable .exe",
        text: "Eine einzige Datei, kein Installer, nichts in den Programmordnern. Läuft aus einem Ordner oder vom USB-Stick.",
        cta: "Portable laden",
      },
    },
    featuresTitle: "Was die Desktop-App bringt",
    features: [
      {
        name: "Ein eigenes Fenster",
        text: "Keine Tabs, keine Browser-Shortcuts, die dir Tasten wegnehmen. Jedes Kürzel landet im Editor.",
      },
      {
        name: "Läuft offline",
        text: "Der Editor steckt in der App. Öffne ihn im Flugzeug und mappe weiter.",
      },
      {
        name: "Gleicher Account, gleiche Maps",
        text: "Melde dich mit osu! an, und deine Cloud-Maps, Collabs und Kommentare folgen dir zwischen Browser und Desktop.",
      },
      {
        name: "Mehr Platz zum Mappen",
        text: "Ohne Browserleiste am oberen Rand bekommt das Playfield den Platz zurück.",
      },
    ],
    notesTitle: "Vor dem Installieren",
    notes: [
      {
        name: "Windows warnt dich einmal",
        text: "Die Builds sind noch nicht signiert, deshalb zeigt SmartScreen „Der Computer wurde durch Windows geschützt“. Wähl Weitere Informationen und dann Trotzdem ausführen.",
      },
      {
        name: "WebView2 kommt mit",
        text: "Die Installer laden Microsofts WebView2-Runtime nach, falls sie fehlt. Windows 11 bringt sie schon mit, und die portable EXE braucht sie ebenfalls.",
      },
      {
        name: "Aktualisieren",
        text: "Lade den neueren Build und führe ihn über den alten aus. Einstellungen und lokale Maps bleiben, wo sie sind.",
      },
      {
        name: "macOS und Linux",
        text: "Noch nicht. Bis dahin läuft Cascade dort in jedem aktuellen Browser.",
      },
    ],
    webTitle: "Nicht auf Windows?",
    webLead:
      "Cascade läuft in jedem modernen Browser, mit demselben Editor, denselben Cloud-Maps und ganz ohne Installation.",
    webCta: "Editor im Browser öffnen",
    browserLink: "Im Browser öffnen",
    noticeError:
      "Der Download-Server ist gerade nicht erreichbar. Versuch es gleich noch mal.",
    noticeEmpty: "Es ist noch kein Desktop-Build veröffentlicht. Schau bald wieder vorbei.",
    noticeOther:
      "Du bist nicht auf Windows. Die Desktop-App gibt es vorerst nur für Windows, die Browser-Version läuft aber überall.",
  },

  ru: {
    navLabel: "Скачать для Windows",
    title: "Скачать Cascade для Windows | редактор osu!mania",
    description:
      "Десктопное приложение Cascade для Windows. Установщик, пакет MSI или один портативный exe. Тот же редактор osu!mania, StepMania и Etterna, в отдельном окне и с работой офлайн.",
    keywords:
      "cascade скачать, редактор osu!mania скачать, mania редактор windows, osu mania десктоп, stepmania редактор скачать, vsrg редактор windows",
    ogTitle: "Cascade для Windows",
    ogDescription:
      "Редактор osu!mania как десктопное приложение. Установщик, MSI или портативный exe, всё для 64-битной Windows.",
    eyebrow: "Десктопное приложение для Windows",
    h1: "Cascade у тебя на рабочем столе",
    lead: "Тот же редактор, что и в браузере, только в отдельном окне. Каждое нажатие уходит на плейфилд, карты лежат на твоём компьютере, а редактор работает дальше, даже когда связь пропала.",
    specs: "Windows 10 и 11 · 64 бита",
    versionPending: "Последняя сборка",
    releasedLabel: "Опубликовано {date}",
    recommended: "Рекомендуем",
    cards: {
      setup: {
        name: "Установщик",
        kind: "установщик .exe",
        text: "Ставит Cascade для твоей учётной записи и добавляет его в меню «Пуск». Бери этот вариант, если сомневаешься.",
        cta: "Скачать установщик",
      },
      msi: {
        name: "Пакет MSI",
        kind: "пакет .msi",
        text: "То же приложение в виде пакета Windows Installer, для машин, где софт разворачивают через MSI.",
        cta: "Скачать MSI",
      },
      portable: {
        name: "Портативная версия",
        kind: "портативный .exe",
        text: "Один исполняемый файл, без установщика и без записи в Program Files. Запускай из папки или с флешки.",
        cta: "Скачать портативную",
      },
    },
    featuresTitle: "Что даёт десктопное приложение",
    features: [
      {
        name: "Отдельное окно",
        text: "Никаких вкладок и браузерных сочетаний, которые забирают клавиши. Каждый хоткей попадает в редактор.",
      },
      {
        name: "Работает офлайн",
        text: "Редактор лежит внутри приложения. Открывай его в самолёте и мапай дальше.",
      },
      {
        name: "Тот же аккаунт, те же карты",
        text: "Войди через osu!, и облачные карты, коллабы и комментарии переезжают за тобой между браузером и десктопом.",
      },
      {
        name: "Больше места для мапинга",
        text: "Без браузерной панели сверху плейфилд забирает это место себе.",
      },
    ],
    notesTitle: "Перед установкой",
    notes: [
      {
        name: "Windows один раз предупредит",
        text: "Сборки пока без подписи, поэтому SmartScreen показывает «Система Windows защитила ваш компьютер». Нажми «Подробнее», затем «Выполнить в любом случае».",
      },
      {
        name: "WebView2 подтянется сам",
        text: "Установщики докачивают среду WebView2 от Microsoft, если её нет. В Windows 11 она уже есть, и портативному exe она тоже нужна.",
      },
      {
        name: "Обновление",
        text: "Скачай свежую сборку и поставь её поверх старой. Настройки и локальные карты останутся на месте.",
      },
      {
        name: "macOS и Linux",
        text: "Пока нет. До тех пор Cascade работает там в любом современном браузере.",
      },
    ],
    webTitle: "Не на Windows?",
    webLead:
      "Cascade работает в любом современном браузере: тот же редактор, те же облачные карты и ничего не нужно ставить.",
    webCta: "Открыть редактор в браузере",
    browserLink: "Открыть в браузере",
    noticeError:
      "Сервер загрузок сейчас недоступен. Попробуй обновить страницу через минуту.",
    noticeEmpty: "Десктопных сборок пока нет. Загляни немного позже.",
    noticeOther:
      "У тебя не Windows. Десктопное приложение пока только для Windows, но версия в браузере работает везде.",
  },

  "zh-CN": {
    navLabel: "下载 Windows 版",
    title: "下载 Windows 版 Cascade | osu!mania 编辑器",
    description:
      "获取 Windows 版 Cascade 桌面应用。安装程序、MSI 包，或者单文件便携版 exe。和网页版同一个 osu!mania、StepMania 与 Etterna 编辑器，拥有独立窗口，可离线使用。",
    keywords:
      "cascade 下载, osu!mania 编辑器下载, mania 编辑器 windows, osu mania 桌面版, stepmania 编辑器下载, vsrg 编辑器 windows",
    ogTitle: "Windows 版 Cascade",
    ogDescription:
      "osu!mania 编辑器的桌面版。安装程序、MSI 或便携版 exe，均为 64 位 Windows。",
    eyebrow: "Windows 桌面应用",
    h1: "把 Cascade 放到桌面上",
    lead: "和你在浏览器里用的是同一个编辑器，只是有了自己的窗口。每一次按键都进入谱面，谱面文件留在你的机器上，断网了也照样能编。",
    specs: "Windows 10 与 11 · 64 位",
    versionPending: "最新版本",
    releasedLabel: "发布于 {date}",
    recommended: "推荐",
    cards: {
      setup: {
        name: "安装程序",
        kind: ".exe 安装程序",
        text: "为当前用户安装 Cascade 并加入开始菜单。拿不准就选这个。",
        cta: "下载安装程序",
      },
      msi: {
        name: "MSI 安装包",
        kind: ".msi 安装包",
        text: "同一个应用的 Windows Installer 包，适合通过 MSI 分发软件的机器。",
        cta: "下载 MSI",
      },
      portable: {
        name: "便携版",
        kind: "便携版 .exe",
        text: "一个可执行文件，不用安装，也不往 Program Files 写东西。放在文件夹或 U 盘里直接运行。",
        cta: "下载便携版",
      },
    },
    featuresTitle: "桌面版多了什么",
    features: [
      {
        name: "独立窗口",
        text: "没有标签页，浏览器快捷键也抢不走按键。每个热键都落在编辑器里。",
      },
      {
        name: "可离线使用",
        text: "编辑器就装在应用里。在飞机上打开它，继续做谱。",
      },
      {
        name: "同一个账号，同一批谱面",
        text: "用 osu! 登录，云端谱面、协作和评论会跟着你在浏览器和桌面之间走。",
      },
      {
        name: "更大的编辑空间",
        text: "顶部不再被浏览器界面占掉，这块地方还给谱面。",
      },
    ],
    notesTitle: "安装之前",
    notes: [
      {
        name: "Windows 会提醒你一次",
        text: "构建还没有代码签名，所以 SmartScreen 会显示“Windows 已保护你的电脑”。点击“更多信息”，再点“仍要运行”。",
      },
      {
        name: "WebView2 会一并处理",
        text: "缺少时安装程序会自动获取微软的 WebView2 运行时。Windows 11 自带，便携版 exe 同样需要它。",
      },
      {
        name: "更新",
        text: "下载新版本并覆盖旧的运行一遍。设置和本地谱面都会留在原处。",
      },
      {
        name: "macOS 和 Linux",
        text: "暂时还没有。在那之前，Cascade 在这些系统上的现代浏览器里照样可用。",
      },
    ],
    webTitle: "不用 Windows？",
    webLead:
      "Cascade 在任何现代浏览器里都能跑，同一个编辑器、同一批云端谱面，什么都不用装。",
    webCta: "打开网页版编辑器",
    browserLink: "在浏览器中打开",
    noticeError: "现在连不上下载服务器，稍后刷新页面再试。",
    noticeEmpty: "还没有发布桌面版，过一阵子再来看看。",
    noticeOther:
      "你现在不在 Windows 上。桌面版目前只有 Windows，不过浏览器版本到哪里都能用。",
  },

  "pt-BR": {
    navLabel: "Baixar para Windows",
    title: "Baixar o Cascade para Windows | Editor de osu!mania",
    description:
      "Baixe o app do Cascade para Windows. Instalador, pacote MSI ou um único exe portátil. O mesmo editor de osu!mania, StepMania e Etterna, em uma janela própria e funcionando offline.",
    keywords:
      "cascade download, editor de osu!mania download, editor mania windows, osu mania app desktop, editor stepmania download, editor vsrg windows",
    ogTitle: "Cascade para Windows",
    ogDescription:
      "O editor de osu!mania como app de desktop. Instalador, MSI ou exe portátil, tudo para Windows 64 bits.",
    eyebrow: "App de desktop para Windows",
    h1: "Cascade no seu desktop",
    lead: "O mesmo editor que você já usa no navegador, agora em uma janela só dele. Cada tecla vai para o playfield, seus mapas ficam na sua máquina e ele continua funcionando quando a conexão cai.",
    specs: "Windows 10 e 11 · 64 bits",
    versionPending: "Versão mais recente",
    releasedLabel: "Publicado em {date}",
    recommended: "Recomendado",
    cards: {
      setup: {
        name: "Instalador",
        kind: "instalador .exe",
        text: "Instala o Cascade na sua conta de usuário e coloca ele no menu Iniciar. Escolha este se estiver na dúvida.",
        cta: "Baixar instalador",
      },
      msi: {
        name: "Pacote MSI",
        kind: "pacote .msi",
        text: "O mesmo app como pacote do Windows Installer, para máquinas que distribuem software por MSI.",
        cta: "Baixar MSI",
      },
      portable: {
        name: "Portátil",
        kind: ".exe portátil",
        text: "Um executável, sem instalador e sem escrever nada em Arquivos de Programas. Rode de uma pasta ou de um pendrive.",
        cta: "Baixar portátil",
      },
    },
    featuresTitle: "O que o app de desktop acrescenta",
    features: [
      {
        name: "Uma janela só dele",
        text: "Sem abas e sem atalhos do navegador roubando suas teclas. Todo atalho cai no editor.",
      },
      {
        name: "Funciona offline",
        text: "O editor vem dentro do app. Abra no avião e continue mapeando.",
      },
      {
        name: "Mesma conta, mesmos mapas",
        text: "Entre com o osu! e seus mapas na nuvem, colabs e comentários acompanham você entre o navegador e o desktop.",
      },
      {
        name: "Mais espaço para mapear",
        text: "Sem a barra do navegador comendo o topo da tela, o playfield recupera esse espaço.",
      },
    ],
    notesTitle: "Antes de instalar",
    notes: [
      {
        name: "O Windows vai avisar uma vez",
        text: "As builds ainda não são assinadas, então o SmartScreen mostra “O Windows protegeu o seu PC”. Clique em Mais informações e depois em Executar assim mesmo.",
      },
      {
        name: "O WebView2 vem junto",
        text: "Os instaladores baixam o runtime WebView2 da Microsoft quando ele não está presente. O Windows 11 já tem, e o exe portátil também precisa dele.",
      },
      {
        name: "Atualizar",
        text: "Baixe a build mais nova e rode por cima da antiga. Suas configurações e mapas locais continuam onde estão.",
      },
      {
        name: "macOS e Linux",
        text: "Ainda não. Até lá, o Cascade roda nesses sistemas em qualquer navegador atual.",
      },
    ],
    webTitle: "Não está no Windows?",
    webLead:
      "O Cascade roda em qualquer navegador moderno com o mesmo editor, os mesmos mapas na nuvem e nada para instalar.",
    webCta: "Abrir o editor no navegador",
    browserLink: "Abrir no navegador",
    noticeError:
      "O servidor de download está fora do ar agora. Tente atualizar a página em instantes.",
    noticeEmpty: "Nenhuma build de desktop foi publicada ainda. Volte a conferir em breve.",
    noticeOther:
      "Você não está no Windows. O app de desktop é só para Windows por enquanto, mas a versão no navegador funciona em todo lugar.",
  },
};
