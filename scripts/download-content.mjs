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
    h1: "Cascade for Windows",
    lead: "Edit your maps offline in a separate window.",
    specs: "Windows 10 and 11 · 64-bit",
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
        name: "Updating",
        text: "Download the newer build and run it over the old one. Your settings and local maps stay where they are.",
      },
    ],
    webTitle: "Not on Windows?",
    webCta: "Open the web editor",
    browserLink: "Open in browser",
    noticeError:
      "The download server is not reachable right now. Try refreshing in a moment.",
    noticeEmpty: "No desktop build is published yet. Check back soon.",
    noticeOther:
      "You are not on Windows. The desktop app is Windows-only for now, but the browser version works everywhere.",
    privacyLink: "Privacy policy",
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
    h1: "Cascade für Windows",
    lead: "Bearbeite deine Maps offline in einem eigenen Fenster.",
    specs: "Windows 10 und 11 · 64-Bit",
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
        name: "Aktualisieren",
        text: "Lade den neueren Build und führe ihn über den alten aus. Einstellungen und lokale Maps bleiben, wo sie sind.",
      },
    ],
    webTitle: "Nicht auf Windows?",
    webCta: "Editor im Browser öffnen",
    browserLink: "Im Browser öffnen",
    noticeError:
      "Der Download-Server ist gerade nicht erreichbar. Versuch es gleich noch mal.",
    noticeEmpty: "Es ist noch kein Desktop-Build veröffentlicht. Schau bald wieder vorbei.",
    noticeOther:
      "Du bist nicht auf Windows. Die Desktop-App gibt es vorerst nur für Windows, die Browser-Version läuft aber überall.",
    privacyLink: "Datenschutzerklärung",
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
    h1: "Cascade для Windows",
    lead: "Редактируй карты офлайн в отдельном окне.",
    specs: "Windows 10 и 11 · 64 бита",
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
        name: "Обновление",
        text: "Скачай свежую сборку и поставь её поверх старой. Настройки и локальные карты останутся на месте.",
      },
    ],
    webTitle: "Не на Windows?",
    webCta: "Открыть редактор в браузере",
    browserLink: "Открыть в браузере",
    noticeError:
      "Сервер загрузок сейчас недоступен. Попробуй обновить страницу через минуту.",
    noticeEmpty: "Десктопных сборок пока нет. Загляни немного позже.",
    noticeOther:
      "У тебя не Windows. Десктопное приложение пока только для Windows, но версия в браузере работает везде.",
    privacyLink: "Политика конфиденциальности",
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
    h1: "Windows 版 Cascade",
    lead: "在独立窗口中离线编辑谱面。",
    specs: "Windows 10 与 11 · 64 位",
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
        name: "更新",
        text: "下载新版本并覆盖旧的运行一遍。设置和本地谱面都会留在原处。",
      },
    ],
    webTitle: "不用 Windows？",
    webCta: "打开网页版编辑器",
    browserLink: "在浏览器中打开",
    noticeError: "现在连不上下载服务器，稍后刷新页面再试。",
    noticeEmpty: "还没有发布桌面版，过一阵子再来看看。",
    noticeOther:
      "你现在不在 Windows 上。桌面版目前只有 Windows，不过浏览器版本到哪里都能用。",
    privacyLink: "隐私政策",
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
    h1: "Cascade para Windows",
    lead: "Edite seus mapas offline em uma janela própria.",
    specs: "Windows 10 e 11 · 64 bits",
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
        name: "Atualizar",
        text: "Baixe a build mais nova e rode por cima da antiga. Suas configurações e mapas locais continuam onde estão.",
      },
    ],
    webTitle: "Não está no Windows?",
    webCta: "Abrir o editor no navegador",
    browserLink: "Abrir no navegador",
    noticeError:
      "O servidor de download está fora do ar agora. Tente atualizar a página em instantes.",
    noticeEmpty: "Nenhuma build de desktop foi publicada ainda. Volte a conferir em breve.",
    noticeOther:
      "Você não está no Windows. O app de desktop é só para Windows por enquanto, mas a versão no navegador funciona em todo lugar.",
    privacyLink: "Política de privacidade",
  },
};
