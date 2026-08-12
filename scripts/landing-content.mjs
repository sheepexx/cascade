export const LOCALES = {
  en: { prefix: "", htmlLang: "en", hreflang: "en", ogLocale: "en_US", name: "English" },
  de: { prefix: "de", htmlLang: "de", hreflang: "de", ogLocale: "de_DE", name: "Deutsch" },
  ru: { prefix: "ru", htmlLang: "ru", hreflang: "ru", ogLocale: "ru_RU", name: "Русский" },
  "zh-CN": { prefix: "zh-cn", htmlLang: "zh-Hans", hreflang: "zh-CN", ogLocale: "zh_CN", name: "简体中文" },
  "pt-BR": { prefix: "pt-br", htmlLang: "pt-BR", hreflang: "pt-BR", ogLocale: "pt_BR", name: "Português" },
};

export function urlFor(slug, locale) {
  const prefix = LOCALES[locale].prefix;
  return prefix ? `/${prefix}/${slug}` : `/${slug}`;
}

const LEGACY_EN = [
  { href: "/how-to-make-an-osu-mania-map", label: "How to make an osu!mania map" },
  { href: "/osu-mania-sv-editor", label: "Edit scroll velocity" },
  { href: "/osu-to-stepmania", label: "Convert to StepMania / Etterna" },
  { href: "/osu-mania-map-viewer", label: "Preview maps online" },
  { href: "/osu-mania-pack-creator", label: "Combine maps into one pack" },
];

export const UI = {
  en: {
    more: "More",
    home: "Cascade, the online osu!mania editor",
    languages: "Read this in",
    ogImageAlt: "Cascade, the osu!mania editor that runs in your browser",
    legacy: LEGACY_EN,
  },
  de: {
    more: "Mehr",
    home: "Cascade, der osu!mania-Editor im Browser",
    languages: "Diese Seite auf",
    ogImageAlt: "Cascade, der osu!mania-Editor im Browser",
    legacy: [],
  },
  ru: {
    more: "Ещё",
    home: "Cascade, редактор osu!mania в браузере",
    languages: "Эта страница на",
    ogImageAlt: "Cascade, редактор osu!mania в браузере",
    legacy: [],
  },
  "zh-CN": {
    more: "更多",
    home: "Cascade，浏览器里的 osu!mania 编辑器",
    languages: "其他语言",
    ogImageAlt: "Cascade，浏览器里的 osu!mania 编辑器",
    legacy: [],
  },
  "pt-BR": {
    more: "Mais",
    home: "Cascade, o editor de osu!mania no navegador",
    languages: "Leia em",
    ogImageAlt: "Cascade, o editor de osu!mania no navegador",
    legacy: [],
  },
};

const playtest = {
  slug: "osu-mania-playtest",
  structured: (c, url) => ({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: c.howToName,
    description: c.ogDescription,
    totalTime: "PT1M",
    tool: { "@type": "HowToTool", name: "Cascade" },
    url,
    step: c.steps.map((s) => ({
      "@type": "HowToStep",
      name: s.name,
      text: s.text,
    })),
  }),
  content: {
    en: {
      navLabel: "Playtest osu!mania maps",
      title: "Playtest osu!mania Maps in Your Browser | Cascade",
      description:
        "Play the chart you are editing straight away. Cascade uses the real osu!mania judgement windows from your OD and reports accuracy, combo, unstable rate, mean hit error and live NPS, with no export and no reload.",
      keywords:
        "osu mania playtest, test osu mania map, play osu mania in browser, osu mania editor playtest, mania judgement windows, unstable rate, osu mania accuracy, osu mania practice, mania rate practice",
      ogTitle: "Playtest your osu!mania map without leaving the editor",
      ogDescription:
        "Press F5 and play the chart you are writing, with real judgement windows, accuracy, unstable rate and live NPS.",
      howToName: "How to playtest an osu!mania map in the browser",
      steps: [
        { name: "Open your map", text: "Load a map in Cascade or import an .osz." },
        { name: "Press F5", text: "The editor hands the chart straight to the playfield and starts the run." },
        { name: "Read the run stats", text: "Accuracy, combo, unstable rate, mean hit error and live NPS update while you play." },
        { name: "Go back and fix it", text: "Press F5 again to drop back into the editor at the same spot and adjust the pattern." },
      ],
      h1: "Play your osu!mania map without leaving the editor",
      lead: `      <p>
        The slowest part of mapping is finding out whether a pattern actually
        feels good. Normally that means exporting, opening the game, loading
        the set, playing, then coming back. Cascade removes the round trip:
        press <code>F5</code> and the chart you are editing becomes playable
        immediately, in the same tab, at the same timestamp.
      </p>`,
      cta: "Open the editor and playtest",
      body: `      <h2>Real judgement, not an approximation</h2>
      <p>
        The playfield uses the osu!mania judgement windows derived from your
        map's overall difficulty, so a run tells you something true about the
        chart. Hits are graded MAX, 300, 200, 100, 50 or miss, long note
        releases get their own wider window, and the numbers you get back are
        the ones you would get in game.
      </p>

      <h2>What the run tells you</h2>
      <ul>
        <li><strong>Accuracy and combo</strong> while the run is going, not just at the end.</li>
        <li><strong>Unstable rate</strong> and <strong>mean hit error</strong>, so you can see whether a section is genuinely hard or just badly timed.</li>
        <li><strong>Live NPS and peak NPS</strong>, which turn a vague feeling of density into a number you can compare between sections.</li>
        <li>A <strong>pp estimate</strong> for the difficulty as you write it.</li>
      </ul>

      <h2>Practise at any rate</h2>
      <p>
        Runs can be played anywhere from 0.75x to 2x. Slowing a burst down
        until you can actually read it is the fastest way to tell whether it is
        unfair or just unfamiliar, and speeding a calm section up exposes
        patterns that fall apart under pressure. The judgement windows scale
        with the rate exactly as the game scales them.
      </p>

      <p class="note">
        Playtest is a mapping tool, not a score submission. Nothing leaves your
        browser and no run is uploaded anywhere.
      </p>

      <h2>Then keep working</h2>
      <p>
        Press <code>F5</code> again and you are back in the editor at the same
        point, ready to move the note that just felt wrong. When the chart
        plays the way you want, export a <code>.osu</code> or <code>.osz</code>,
        or carry on with <a href="/osu-mania-sv-editor">scroll velocity</a> and
        <a href="/osu-mania-aimod">a full map check</a>.
      </p>`,
    },
    de: {
      navLabel: "osu!mania-Maps testspielen",
      title: "osu!mania-Maps im Browser testspielen | Cascade",
      description:
        "Spiele die Map, die du gerade baust, sofort an. Cascade nutzt die echten osu!mania-Wertungsfenster aus deiner OD und zeigt Genauigkeit, Combo, Unstable Rate, mittleren Trefferfehler und Live-NPS, ohne Export und ohne Neuladen.",
      keywords:
        "osu mania playtest, osu mania map testen, osu mania im browser spielen, mania wertungsfenster, unstable rate, osu mania genauigkeit, mania editor",
      ogTitle: "Teste deine osu!mania-Map direkt im Editor",
      ogDescription:
        "Drücke F5 und spiele die Map, an der du schreibst: echte Wertungsfenster, Genauigkeit, Unstable Rate und Live-NPS.",
      howToName: "So testest du eine osu!mania-Map im Browser",
      steps: [
        { name: "Map öffnen", text: "Lade eine Map in Cascade oder importiere eine .osz-Datei." },
        { name: "F5 drücken", text: "Der Editor übergibt die Map direkt an das Spielfeld und startet den Durchlauf." },
        { name: "Statistiken lesen", text: "Genauigkeit, Combo, Unstable Rate, mittlerer Trefferfehler und Live-NPS laufen während des Spielens mit." },
        { name: "Zurück und anpassen", text: "Drücke erneut F5, um an derselben Stelle in den Editor zurückzukehren und das Muster zu ändern." },
      ],
      h1: "Spiele deine osu!mania-Map, ohne den Editor zu verlassen",
      lead: `      <p>
        Der langsamste Teil des Mappings ist herauszufinden, ob sich ein Muster
        wirklich gut anfühlt. Normalerweise heißt das: exportieren, Spiel
        öffnen, Set laden, spielen, zurückkommen. Cascade spart diesen Umweg:
        Drücke <code>F5</code> und die Map, die du bearbeitest, ist sofort
        spielbar, im selben Tab und an derselben Stelle.
      </p>`,
      cta: "Editor öffnen und testspielen",
      body: `      <h2>Echte Wertung statt Näherung</h2>
      <p>
        Das Spielfeld nutzt die osu!mania-Wertungsfenster, die sich aus der
        Overall Difficulty deiner Map ergeben. Ein Durchlauf sagt also etwas
        Echtes über die Map aus. Treffer werden als MAX, 300, 200, 100, 50 oder
        Miss gewertet, das Loslassen langer Noten bekommt sein eigenes,
        breiteres Fenster, und die Zahlen entsprechen denen im Spiel.
      </p>

      <h2>Was dir ein Durchlauf verrät</h2>
      <ul>
        <li><strong>Genauigkeit und Combo</strong> laufend, nicht erst am Ende.</li>
        <li><strong>Unstable Rate</strong> und <strong>mittlerer Trefferfehler</strong>: So siehst du, ob eine Passage wirklich schwer oder nur schlecht getimt ist.</li>
        <li><strong>Live-NPS und Spitzen-NPS</strong> machen aus einem vagen Dichtegefühl eine vergleichbare Zahl.</li>
        <li>Eine <strong>pp-Schätzung</strong> für die Schwierigkeit, während du sie schreibst.</li>
      </ul>

      <h2>Übe in jedem Tempo</h2>
      <p>
        Durchläufe sind von 0,75x bis 2x möglich. Einen Burst so weit zu
        verlangsamen, dass du ihn wirklich lesen kannst, ist der schnellste Weg
        herauszufinden, ob er unfair oder nur ungewohnt ist. Umgekehrt zeigt
        eine beschleunigte ruhige Passage Muster, die unter Druck auseinander
        fallen. Die Wertungsfenster skalieren dabei genau wie im Spiel.
      </p>

      <p class="note">
        Testspielen ist ein Mapping-Werkzeug, keine Score-Einreichung. Nichts
        verlässt deinen Browser und kein Durchlauf wird irgendwo hochgeladen.
      </p>

      <h2>Und dann weiterarbeiten</h2>
      <p>
        Drücke wieder <code>F5</code> und du bist an derselben Stelle zurück im
        Editor, bereit, die Note zu verschieben, die sich gerade falsch
        angefühlt hat. Wenn die Map so spielt, wie du willst, exportiere eine
        <code>.osu</code>- oder <code>.osz</code>-Datei.
      </p>`,
    },
    ru: {
      navLabel: "Тестировать карты osu!mania",
      title: "Тестируйте карты osu!mania прямо в браузере | Cascade",
      description:
        "Играйте карту, которую редактируете, сразу же. Cascade использует настоящие окна точности osu!mania из вашей OD и показывает точность, комбо, unstable rate, среднюю ошибку попадания и NPS в реальном времени, без экспорта и перезагрузки.",
      keywords:
        "osu mania playtest, тест карты osu mania, играть osu mania в браузере, окна точности mania, unstable rate, точность osu mania, редактор mania",
      ogTitle: "Тестируйте карту osu!mania, не выходя из редактора",
      ogDescription:
        "Нажмите F5 и сыграйте карту, которую пишете: настоящие окна точности, точность, unstable rate и NPS в реальном времени.",
      howToName: "Как протестировать карту osu!mania в браузере",
      steps: [
        { name: "Откройте карту", text: "Загрузите карту в Cascade или импортируйте файл .osz." },
        { name: "Нажмите F5", text: "Редактор передаёт карту прямо на игровое поле и запускает заход." },
        { name: "Смотрите статистику", text: "Точность, комбо, unstable rate, средняя ошибка и NPS обновляются прямо во время игры." },
        { name: "Вернитесь и поправьте", text: "Нажмите F5 ещё раз, чтобы вернуться в редактор на том же месте и изменить паттерн." },
      ],
      h1: "Играйте свою карту osu!mania, не выходя из редактора",
      lead: `      <p>
        Самая медленная часть маппинга — понять, действительно ли паттерн
        играется хорошо. Обычно это значит: экспортировать, открыть игру,
        загрузить сет, сыграть и вернуться назад. Cascade убирает этот круг:
        нажмите <code>F5</code>, и карта, которую вы редактируете, сразу
        становится играбельной, в той же вкладке и на том же месте.
      </p>`,
      cta: "Открыть редактор и сыграть",
      body: `      <h2>Настоящая точность, а не приближение</h2>
      <p>
        Игровое поле использует окна точности osu!mania, вычисленные из overall
        difficulty вашей карты, поэтому заход говорит о карте правду. Попадания
        оцениваются как MAX, 300, 200, 100, 50 или промах, отпускание длинных
        нот получает собственное более широкое окно, а числа совпадают с теми,
        что вы увидели бы в игре.
      </p>

      <h2>Что показывает заход</h2>
      <ul>
        <li><strong>Точность и комбо</strong> по ходу игры, а не только в конце.</li>
        <li><strong>Unstable rate</strong> и <strong>средняя ошибка попадания</strong>: видно, действительно ли участок сложный или просто плохо оттаймингован.</li>
        <li><strong>Текущий и пиковый NPS</strong> превращают смутное ощущение плотности в число, которое можно сравнивать.</li>
        <li><strong>Оценка pp</strong> для сложности прямо во время работы.</li>
      </ul>

      <h2>Тренируйтесь на любой скорости</h2>
      <p>
        Заходы доступны от 0,75x до 2x. Замедлить бёрст настолько, чтобы его
        реально можно было прочитать, — самый быстрый способ понять, нечестный
        он или просто непривычный. И наоборот, ускоренный спокойный участок
        покажет паттерны, которые разваливаются под давлением. Окна точности
        масштабируются точно так же, как в игре.
      </p>

      <p class="note">
        Тестовая игра — инструмент маппинга, а не отправка результата. Ничего не
        покидает ваш браузер, и ни один заход никуда не загружается.
      </p>

      <h2>А потом дальше за работу</h2>
      <p>
        Нажмите <code>F5</code> снова, и вы вернётесь в редактор на том же
        месте, готовые подвинуть ноту, которая только что игралась не так.
        Когда карта играется как надо, экспортируйте <code>.osu</code> или
        <code>.osz</code>.
      </p>`,
    },
    "zh-CN": {
      navLabel: "试玩 osu!mania 谱面",
      title: "在浏览器里试玩 osu!mania 谱面 | Cascade",
      description:
        "立刻试玩正在编辑的谱面。Cascade 按你的 OD 使用真实的 osu!mania 判定区间，实时显示准确率、连击、UR、平均误差和 NPS，无需导出，也无需重新加载。",
      keywords:
        "osu mania 试玩, 测试 osu mania 谱面, 浏览器玩 osu mania, mania 判定区间, unstable rate, osu mania 准确率, mania 编辑器",
      ogTitle: "不离开编辑器，直接试玩你的 osu!mania 谱面",
      ogDescription:
        "按 F5 就能玩你正在写的谱面：真实判定区间、准确率、UR 和实时 NPS。",
      howToName: "如何在浏览器里试玩 osu!mania 谱面",
      steps: [
        { name: "打开谱面", text: "在 Cascade 里加载谱面，或导入一个 .osz 文件。" },
        { name: "按 F5", text: "编辑器会把谱面直接交给游戏区域并开始这一次游玩。" },
        { name: "查看数据", text: "准确率、连击、UR、平均误差和实时 NPS 会在游玩过程中持续更新。" },
        { name: "回去修改", text: "再按一次 F5，就能回到编辑器中相同的位置去调整排键。" },
      ],
      h1: "不离开编辑器，直接玩你的 osu!mania 谱面",
      lead: `      <p>
        做图最慢的一步，是判断一段排键到底手感好不好。通常这意味着导出、打开游戏、
        加载谱面、游玩，然后再回来。Cascade 省掉了这一圈：按下 <code>F5</code>，
        你正在编辑的谱面立刻就能玩，还是同一个标签页、同一个时间点。
      </p>`,
      cta: "打开编辑器并试玩",
      body: `      <h2>真实判定，而不是近似</h2>
      <p>
        游戏区域使用由谱面 overall difficulty 推导出的 osu!mania 判定区间，
        因此一次游玩能真实反映谱面的情况。打击会被判定为 MAX、300、200、100、50
        或 miss，长条尾部有自己更宽的判定区间，得到的数字和游戏里一致。
      </p>

      <h2>一次游玩能告诉你什么</h2>
      <ul>
        <li>游玩过程中实时的<strong>准确率与连击</strong>，而不是只有结算。</li>
        <li><strong>UR</strong> 和<strong>平均打击误差</strong>，让你看清某一段是真的难，还是只是时间轴没对准。</li>
        <li><strong>实时 NPS 与峰值 NPS</strong>，把模糊的密度感受变成可比较的数字。</li>
        <li>边写边看的难度 <strong>pp 估算</strong>。</li>
      </ul>

      <h2>任意倍速练习</h2>
      <p>
        游玩速度可以在 0.75x 到 2x 之间调整。把一段密集串降速到能真正看清，
        是判断它究竟是不合理还是只是不熟悉的最快方法；反过来，把平缓段加速，
        则能暴露出在压力下会崩掉的排键。判定区间会像游戏里那样随倍速缩放。
      </p>

      <p class="note">
        试玩是做图工具，不是成绩提交。所有数据都留在你的浏览器里，任何一次游玩都不会被上传。
      </p>

      <h2>然后继续做图</h2>
      <p>
        再按一次 <code>F5</code>，你就回到编辑器中相同的位置，可以立刻去挪动刚才手感不对的那颗音符。
        当谱面玩起来符合预期，就导出 <code>.osu</code> 或 <code>.osz</code>。
      </p>`,
    },
    "pt-BR": {
      navLabel: "Testar mapas de osu!mania",
      title: "Teste mapas de osu!mania no navegador | Cascade",
      description:
        "Jogue na hora o mapa que você está editando. O Cascade usa as janelas de julgamento reais do osu!mania a partir do seu OD e mostra precisão, combo, unstable rate, erro médio e NPS ao vivo, sem exportar e sem recarregar.",
      keywords:
        "osu mania playtest, testar mapa osu mania, jogar osu mania no navegador, janelas de julgamento mania, unstable rate, precisao osu mania, editor mania",
      ogTitle: "Teste seu mapa de osu!mania sem sair do editor",
      ogDescription:
        "Aperte F5 e jogue o mapa que você está escrevendo: janelas de julgamento reais, precisão, unstable rate e NPS ao vivo.",
      howToName: "Como testar um mapa de osu!mania no navegador",
      steps: [
        { name: "Abra seu mapa", text: "Carregue um mapa no Cascade ou importe um .osz." },
        { name: "Aperte F5", text: "O editor entrega o mapa direto para a área de jogo e começa a partida." },
        { name: "Leia as estatísticas", text: "Precisão, combo, unstable rate, erro médio e NPS ao vivo se atualizam enquanto você joga." },
        { name: "Volte e ajuste", text: "Aperte F5 de novo para voltar ao editor no mesmo ponto e mudar o padrão." },
      ],
      h1: "Jogue seu mapa de osu!mania sem sair do editor",
      lead: `      <p>
        A parte mais lenta de mapear é descobrir se um padrão realmente fica
        bom de jogar. Normalmente isso significa exportar, abrir o jogo,
        carregar o set, jogar e voltar. O Cascade elimina essa volta toda:
        aperte <code>F5</code> e o mapa que você está editando fica jogável na
        hora, na mesma aba e no mesmo ponto da música.
      </p>`,
      cta: "Abrir o editor e testar",
      body: `      <h2>Julgamento real, não uma aproximação</h2>
      <p>
        A área de jogo usa as janelas de julgamento do osu!mania derivadas do
        overall difficulty do seu mapa, então uma partida diz algo verdadeiro
        sobre ele. As notas são julgadas como MAX, 300, 200, 100, 50 ou miss, a
        soltura das notas longas tem a própria janela mais larga, e os números
        são os mesmos que você veria no jogo.
      </p>

      <h2>O que a partida mostra</h2>
      <ul>
        <li><strong>Precisão e combo</strong> durante a partida, não só no fim.</li>
        <li><strong>Unstable rate</strong> e <strong>erro médio</strong>, para saber se um trecho é difícil de verdade ou só está mal cronometrado.</li>
        <li><strong>NPS ao vivo e NPS de pico</strong>, que transformam uma sensação vaga de densidade em um número comparável.</li>
        <li>Uma <strong>estimativa de pp</strong> para a dificuldade enquanto você a escreve.</li>
      </ul>

      <h2>Treine em qualquer velocidade</h2>
      <p>
        As partidas rodam de 0,75x a 2x. Desacelerar um burst até conseguir
        lê-lo de verdade é o jeito mais rápido de saber se ele é injusto ou só
        pouco familiar, e acelerar um trecho calmo revela padrões que
        desmoronam sob pressão. As janelas de julgamento escalam junto,
        exatamente como no jogo.
      </p>

      <p class="note">
        O teste é uma ferramenta de mapeamento, não um envio de score. Nada sai
        do seu navegador e nenhuma partida é enviada para lugar nenhum.
      </p>

      <h2>Depois é só continuar</h2>
      <p>
        Aperte <code>F5</code> de novo e você volta ao editor no mesmo ponto,
        pronto para mover a nota que acabou de parecer errada. Quando o mapa
        jogar do jeito que você quer, exporte um <code>.osu</code> ou
        <code>.osz</code>.
      </p>`,
    },
  },
};

const collab = {
  slug: "osu-mania-collab",
  content: {
    en: {
      navLabel: "Map together in real time",
      title: "Collaborative osu!mania Mapping in Real Time | Cascade",
      description:
        "Invite another mapper by osu! username and edit the same osu!mania map together. See each other's cursors and playhead live, set editor or viewer access, and leave comments pinned to a timestamp.",
      keywords:
        "collaborative beatmap editor, osu mania collab, map together, realtime beatmap editing, osu mania guest difficulty, collab mapping, shared beatmap editor",
      ogTitle: "Map an osu!mania chart together, live",
      ogDescription:
        "Invite by osu! username, edit the same map at the same time, and leave comments pinned to a timestamp.",
      h1: "Map together, in the same chart, at the same time",
      lead: `      <p>
        Collab mapping normally runs on file swaps: someone exports a
        <code>.osz</code>, someone else opens it, edits, sends it back, and
        whoever forgot to pull first loses their work. Cascade keeps everyone in
        one live chart instead, so a guest difficulty or a full collab set is
        just two people in the same editor.
      </p>`,
      cta: "Open the editor",
      body: `      <h2>Invite by osu! username</h2>
      <p>
        Save a map to your account, open <em>Share</em>, and invite someone by
        their osu! username. They get a notification in their Cascade inbox and
        the map appears in their My Maps. Nobody has to send a file or agree on
        who is holding the latest version.
      </p>

      <h2>Editor or viewer</h2>
      <p>
        Each person you invite is an <strong>editor</strong>, who can change the
        chart, or a <strong>viewer</strong>, who can follow along and comment but
        not edit. Viewer access is the honest way to show a work in progress to
        someone whose opinion you want without risking the file.
      </p>

      <h2>You can see each other work</h2>
      <p>
        Everyone in the session shows up with their avatar, their cursor and
        their playhead, so you can watch where the other person is working and
        stay out of each other's way. Notes appear as they are placed. There is
        no save button to coordinate around and no merge step at the end.
      </p>

      <h2>Comments pinned to a timestamp</h2>
      <p>
        Feedback on a chart is useless if nobody can find the bar it is about.
        Comments in Cascade are anchored to a time in the song and to a
        difficulty, so clicking one jumps the editor straight to the pattern
        being discussed. Threads can be resolved once the note has been dealt
        with.
      </p>

      <p class="note">
        Collaboration needs an account, because invitations are tied to osu!
        usernames. Local maps stay entirely on your machine.
      </p>`,
    },
    de: {
      navLabel: "Gemeinsam in Echtzeit mappen",
      title: "osu!mania gemeinsam in Echtzeit mappen | Cascade",
      description:
        "Lade andere Mapper per osu!-Benutzernamen ein und bearbeitet dieselbe osu!mania-Map gemeinsam. Seht Cursor und Abspielposition der anderen live, vergebt Editor- oder Betrachterrechte und hinterlasst Kommentare an einem Zeitstempel.",
      keywords:
        "kollaborativer beatmap editor, osu mania collab, gemeinsam mappen, beatmap in echtzeit bearbeiten, guest difficulty, mania mapping zusammen",
      ogTitle: "Baut eine osu!mania-Map gemeinsam, live",
      ogDescription:
        "Per osu!-Namen einladen, gleichzeitig dieselbe Map bearbeiten und Kommentare an einem Zeitstempel hinterlassen.",
      h1: "Gemeinsam mappen, in derselben Map, zur selben Zeit",
      lead: `      <p>
        Collab-Mapping läuft normalerweise über Dateiaustausch: Jemand
        exportiert eine <code>.osz</code>, jemand anderes öffnet sie,
        bearbeitet sie, schickt sie zurück, und wer vergessen hat, vorher die
        neueste Version zu holen, verliert seine Arbeit. Cascade hält
        stattdessen alle in derselben lebenden Map.
      </p>`,
      cta: "Editor öffnen",
      body: `      <h2>Einladen per osu!-Benutzername</h2>
      <p>
        Speichere eine Map in deinem Konto, öffne <em>Teilen</em> und lade
        jemanden über den osu!-Benutzernamen ein. Die Person bekommt eine
        Benachrichtigung im Cascade-Postfach, und die Map erscheint bei ihr
        unter „Meine Maps“. Niemand muss eine Datei verschicken oder klären,
        wer gerade die aktuelle Fassung hat.
      </p>

      <h2>Bearbeiten oder nur zusehen</h2>
      <p>
        Jede eingeladene Person ist entweder <strong>Editor</strong> und darf
        die Map ändern, oder <strong>Betrachter</strong> und darf mitlesen und
        kommentieren, aber nicht bearbeiten. Betrachterrechte sind der ehrliche
        Weg, jemandem einen Zwischenstand zu zeigen, ohne die Datei zu
        riskieren.
      </p>

      <h2>Ihr seht euch bei der Arbeit zu</h2>
      <p>
        Alle in der Sitzung erscheinen mit Avatar, Cursor und
        Abspielposition. So siehst du, wo die andere Person gerade arbeitet,
        und ihr geht euch nicht gegenseitig in die Quere. Noten tauchen auf,
        sobald sie gesetzt werden. Es gibt keinen Speicherknopf, den ihr
        abstimmen müsst, und keinen Merge-Schritt am Ende.
      </p>

      <h2>Kommentare am Zeitstempel</h2>
      <p>
        Feedback zu einer Map ist wertlos, wenn niemand die gemeinte Stelle
        findet. Kommentare in Cascade hängen an einer Zeit im Song und an einer
        Schwierigkeit. Ein Klick springt im Editor direkt zu der Stelle, um die
        es geht, und erledigte Threads lassen sich abhaken.
      </p>

      <p class="note">
        Zusammenarbeit braucht ein Konto, weil Einladungen an osu!-Namen
        hängen. Lokale Maps bleiben vollständig auf deinem Rechner.
      </p>`,
    },
    ru: {
      navLabel: "Совместный маппинг в реальном времени",
      title: "Совместный маппинг osu!mania в реальном времени | Cascade",
      description:
        "Пригласите другого маппера по нику osu! и редактируйте одну карту osu!mania вместе. Видите курсоры и позицию воспроизведения друг друга, выдавайте права редактора или зрителя и оставляйте комментарии, привязанные ко времени.",
      keywords:
        "совместный редактор карт, osu mania collab, маппить вместе, редактирование карты в реальном времени, guest difficulty, совместный маппинг",
      ogTitle: "Стройте карту osu!mania вместе, в реальном времени",
      ogDescription:
        "Приглашайте по нику osu!, редактируйте одну карту одновременно и оставляйте комментарии, привязанные ко времени.",
      h1: "Маппите вместе, в одной карте, одновременно",
      lead: `      <p>
        Совместный маппинг обычно держится на обмене файлами: кто-то
        экспортирует <code>.osz</code>, кто-то другой открывает, правит,
        отправляет обратно, и тот, кто забыл сначала скачать свежую версию,
        теряет свою работу. Cascade вместо этого держит всех в одной живой
        карте.
      </p>`,
      cta: "Открыть редактор",
      body: `      <h2>Приглашение по нику osu!</h2>
      <p>
        Сохраните карту в своём аккаунте, откройте <em>Поделиться</em> и
        пригласите человека по нику osu!. Он получит уведомление во входящих
        Cascade, и карта появится у него в «Мои карты». Никому не нужно
        пересылать файл или выяснять, у кого сейчас актуальная версия.
      </p>

      <h2>Редактор или зритель</h2>
      <p>
        Каждый приглашённый — либо <strong>редактор</strong>, который может
        менять карту, либо <strong>зритель</strong>, который следит за работой и
        комментирует, но не правит. Права зрителя — честный способ показать
        промежуточный результат тому, чьё мнение вам важно, не рискуя файлом.
      </p>

      <h2>Вы видите работу друг друга</h2>
      <p>
        Все участники сессии видны с аватаром, курсором и позицией
        воспроизведения, так что вы понимаете, где сейчас работает другой, и не
        мешаете друг другу. Ноты появляются сразу после установки. Нет кнопки
        сохранения, вокруг которой надо договариваться, и нет слияния версий в
        конце.
      </p>

      <h2>Комментарии, привязанные ко времени</h2>
      <p>
        Отзыв о карте бесполезен, если никто не может найти нужный такт.
        Комментарии в Cascade привязаны ко времени в песне и к сложности:
        щелчок переносит редактор прямо к обсуждаемому месту, а закрытые ветки
        можно отмечать как решённые.
      </p>

      <p class="note">
        Для совместной работы нужен аккаунт, потому что приглашения привязаны к
        никам osu!. Локальные карты полностью остаются на вашем компьютере.
      </p>`,
    },
    "zh-CN": {
      navLabel: "实时协作做图",
      title: "实时协作制作 osu!mania 谱面 | Cascade",
      description:
        "用 osu! 用户名邀请其他作图者，一起编辑同一张 osu!mania 谱面。实时看到彼此的光标和播放位置，分配编辑或只读权限，并留下绑定到时间点的评论。",
      keywords:
        "协作谱面编辑器, osu mania 联合作图, 一起做图, 实时编辑谱面, guest difficulty, 共享谱面编辑器",
      ogTitle: "多人实时一起做 osu!mania 谱面",
      ogDescription:
        "用 osu! 用户名邀请，同时编辑同一张谱面，并留下绑定到时间点的评论。",
      h1: "同一张谱面，同一时间，一起做图",
      lead: `      <p>
        联合作图通常靠传文件：一个人导出 <code>.osz</code>，另一个人打开、修改、
        再发回来，而忘了先拉取最新版本的那个人就会丢掉自己的工作。
        Cascade 让所有人待在同一张实时谱面里。
      </p>`,
      cta: "打开编辑器",
      body: `      <h2>用 osu! 用户名邀请</h2>
      <p>
        把谱面保存到账号里，打开<em>分享</em>，然后用 osu! 用户名邀请对方。
        对方会在 Cascade 收件箱收到通知，谱面也会出现在他的「我的谱面」里。
        谁都不用发文件，也不用确认最新版本在谁手上。
      </p>

      <h2>编辑者或旁观者</h2>
      <p>
        每个被邀请的人要么是<strong>编辑者</strong>，可以改动谱面；
        要么是<strong>旁观者</strong>，可以跟着看、可以评论，但不能编辑。
        旁观权限是把半成品拿给别人看又不担心文件被改坏的稳妥做法。
      </p>

      <h2>你们能看见彼此的工作</h2>
      <p>
        会话中的每个人都会带着头像、光标和播放位置出现，
        因此你能看到对方正在哪一段工作，互不干扰。音符一放下就会出现。
        没有需要互相协调的保存按钮，最后也不需要合并。
      </p>

      <h2>绑定到时间点的评论</h2>
      <p>
        如果没人找得到说的是哪一小节，对谱面的反馈就毫无意义。
        Cascade 的评论会绑定到歌曲中的某个时间和某个难度，
        点一下就能让编辑器跳到正在讨论的那段排键，处理完的讨论还能标记为已解决。
      </p>

      <p class="note">
        协作需要账号，因为邀请是绑定 osu! 用户名的。本地谱面则完全留在你自己的电脑上。
      </p>`,
    },
    "pt-BR": {
      navLabel: "Mapear junto em tempo real",
      title: "Mapeamento colaborativo de osu!mania em tempo real | Cascade",
      description:
        "Convide outro mapper pelo nome de usuário do osu! e editem o mesmo mapa de osu!mania juntos. Vejam o cursor e a posição de reprodução um do outro ao vivo, definam acesso de editor ou visualizador e deixem comentários presos a um instante da música.",
      keywords:
        "editor de beatmap colaborativo, osu mania collab, mapear junto, edicao de beatmap em tempo real, guest difficulty, editor compartilhado",
      ogTitle: "Façam um mapa de osu!mania juntos, ao vivo",
      ogDescription:
        "Convide pelo nome de usuário do osu!, editem o mesmo mapa ao mesmo tempo e deixem comentários presos a um instante.",
      h1: "Mapeiem juntos, no mesmo mapa, ao mesmo tempo",
      lead: `      <p>
        Colaboração normalmente funciona na base da troca de arquivos: alguém
        exporta um <code>.osz</code>, outra pessoa abre, edita, devolve, e quem
        esqueceu de pegar a versão nova antes perde o próprio trabalho. O
        Cascade mantém todo mundo no mesmo mapa ao vivo.
      </p>`,
      cta: "Abrir o editor",
      body: `      <h2>Convide pelo nome de usuário do osu!</h2>
      <p>
        Salve um mapa na sua conta, abra <em>Compartilhar</em> e convide alguém
        pelo nome de usuário do osu!. A pessoa recebe uma notificação na caixa
        de entrada do Cascade e o mapa aparece em Meus Mapas. Ninguém precisa
        mandar arquivo nem combinar quem está com a versão mais recente.
      </p>

      <h2>Editor ou visualizador</h2>
      <p>
        Cada pessoa convidada é <strong>editor</strong>, e pode mudar o mapa, ou
        <strong>visualizador</strong>, que acompanha e comenta mas não edita. O
        acesso de visualizador é o jeito honesto de mostrar um trabalho em
        andamento para quem você quer ouvir sem arriscar o arquivo.
      </p>

      <h2>Vocês se veem trabalhando</h2>
      <p>
        Todo mundo na sessão aparece com avatar, cursor e posição de
        reprodução, então dá para ver em que trecho a outra pessoa está e não
        atrapalhar. As notas surgem conforme são colocadas. Não existe botão de
        salvar para combinar nem etapa de merge no fim.
      </p>

      <h2>Comentários presos a um instante</h2>
      <p>
        Um comentário sobre o mapa não serve de nada se ninguém acha o compasso
        de que ele fala. No Cascade os comentários ficam ancorados a um tempo da
        música e a uma dificuldade, então clicar em um leva o editor direto ao
        padrão em discussão, e as conversas resolvidas podem ser marcadas como
        tal.
      </p>

      <p class="note">
        A colaboração precisa de uma conta, porque os convites são ligados a
        nomes de usuário do osu!. Mapas locais ficam inteiramente na sua
        máquina.
      </p>`,
    },
  },
};

const aimod = {
  slug: "osu-mania-aimod",
  content: {
    en: {
      navLabel: "Check a map before upload",
      title: "osu!mania AiMod: Check Your Map Before You Upload | Cascade",
      description:
        "Run a full check over your osu!mania mapset in the browser. Cascade flags missing metadata, timing problems, unsnapped objects, concurrent notes, broken long notes and out-of-range columns, and jumps you to each one.",
      keywords:
        "osu mania aimod, beatmap checker, osu mania map check, unsnapped notes, concurrent objects, osu mania ranking criteria, mapset validation, osu mania modding",
      ogTitle: "Check your osu!mania map before you upload it",
      ogDescription:
        "Metadata, timing, snapping, long notes and column errors, all flagged in one pass with a jump to each issue.",
      h1: "Find the problems before a modder does",
      lead: `      <p>
        Most of the notes you get on a first mod are not about taste. They are
        unsnapped objects, a difficulty with no red line, two notes stacked in
        one column, a long note one millisecond long. Cascade's
        <strong>AiMod</strong> sweeps the whole mapset for exactly that class of
        problem, so the feedback you do get is about the mapping.
      </p>`,
      cta: "Open the editor and run AiMod",
      body: `      <h2>What it checks</h2>
      <ul>
        <li><strong>Metadata</strong>: missing romanised title, artist or creator, and an empty tags field.</li>
        <li><strong>Mapset</strong>: no audio loaded, no difficulties, difficulties that share a name, and a set that mixes key counts.</li>
        <li><strong>Timing</strong>: a difficulty with no uninherited red line, objects that start before the first timing point, invalid BPM values, duplicate points, and inherited green lines sitting before the first red one.</li>
        <li><strong>Snapping</strong>: objects and long note ends that do not sit on the beat grid.</li>
        <li><strong>Notes</strong>: concurrent objects in the same column, long notes that end before they start, long notes too short to be playable, and objects in a column outside the key count.</li>
      </ul>

      <h2>Errors and warnings are not the same</h2>
      <p>
        Anything marked as an <strong>error</strong> will either break the file
        or get the set rejected: a missing creator, a chart with no timing, a
        note in column five of a 4K difficulty. A <strong>warning</strong> is
        something to look at and possibly keep, like a set that deliberately
        mixes key counts, or an unsnapped object in a section that is
        intentionally free.
      </p>

      <h2>Jump straight to the issue</h2>
      <p>
        Every finding names the difficulty it came from, so a set with eight
        charts still gives you a list you can work through instead of a wall of
        text. Fix, re-run, and watch the list shrink.
      </p>

      <p class="note">
        AiMod checks structure, not taste. It will never tell you a pattern is
        boring, and it is not a substitute for a real mod.
      </p>`,
    },
    de: {
      navLabel: "Map vor dem Upload prüfen",
      title: "osu!mania AiMod: Map vor dem Upload prüfen | Cascade",
      description:
        "Prüfe dein osu!mania-Mapset vollständig im Browser. Cascade meldet fehlende Metadaten, Timing-Probleme, nicht gesnappte Objekte, gleichzeitige Noten, kaputte lange Noten und Spalten außerhalb des Keymodes und springt dich zu jedem Fund.",
      keywords:
        "osu mania aimod, beatmap checker, osu mania map prüfen, ungesnappte noten, gleichzeitige objekte, ranking criteria, mapset prüfung, osu mania modding",
      ogTitle: "Prüfe deine osu!mania-Map, bevor du sie hochlädst",
      ogDescription:
        "Metadaten, Timing, Snapping, lange Noten und Spaltenfehler in einem Durchlauf, mit Sprung zu jedem Fund.",
      h1: "Finde die Fehler, bevor ein Modder sie findet",
      lead: `      <p>
        Die meisten Anmerkungen aus einem ersten Mod haben nichts mit Geschmack
        zu tun. Es sind ungesnappte Objekte, eine Schwierigkeit ohne rote Linie,
        zwei Noten in derselben Spalte, eine lange Note von einer Millisekunde.
        Cascades <strong>AiMod</strong> durchsucht das ganze Mapset genau nach
        dieser Art Problem, damit das Feedback, das du bekommst, wirklich vom
        Mapping handelt.
      </p>`,
      cta: "Editor öffnen und AiMod starten",
      body: `      <h2>Was geprüft wird</h2>
      <ul>
        <li><strong>Metadaten</strong>: fehlender romanisierter Titel, Künstler oder Creator und ein leeres Tags-Feld.</li>
        <li><strong>Mapset</strong>: kein Audio geladen, keine Schwierigkeiten, Schwierigkeiten mit gleichem Namen und ein Set, das Keymodes mischt.</li>
        <li><strong>Timing</strong>: eine Schwierigkeit ohne rote Linie, Objekte vor dem ersten Timing-Punkt, ungültige BPM-Werte, doppelte Punkte und grüne Linien vor der ersten roten.</li>
        <li><strong>Snapping</strong>: Objekte und Enden langer Noten, die nicht auf dem Raster liegen.</li>
        <li><strong>Noten</strong>: gleichzeitige Objekte in derselben Spalte, lange Noten, die vor ihrem Anfang enden, zu kurze lange Noten und Objekte in Spalten außerhalb des Keymodes.</li>
      </ul>

      <h2>Fehler und Warnungen sind nicht dasselbe</h2>
      <p>
        Was als <strong>Fehler</strong> markiert ist, macht entweder die Datei
        kaputt oder führt zur Ablehnung des Sets: fehlender Creator, eine Map
        ohne Timing, eine Note in Spalte fünf einer 4K-Schwierigkeit. Eine
        <strong>Warnung</strong> ist etwas, das du dir ansehen und bewusst
        behalten kannst, etwa ein Set, das absichtlich Keymodes mischt.
      </p>

      <h2>Direkt zur Fundstelle springen</h2>
      <p>
        Jeder Fund nennt die Schwierigkeit, aus der er stammt. So bekommst du
        auch bei acht Charts eine abarbeitbare Liste statt einer Textwand.
        Beheben, erneut laufen lassen, Liste schrumpfen sehen.
      </p>

      <p class="note">
        AiMod prüft Struktur, nicht Geschmack. Es wird dir nie sagen, dass ein
        Muster langweilig ist, und ersetzt keinen echten Mod.
      </p>`,
    },
    ru: {
      navLabel: "Проверить карту перед загрузкой",
      title: "osu!mania AiMod: проверьте карту перед загрузкой | Cascade",
      description:
        "Полная проверка вашего сета osu!mania прямо в браузере. Cascade находит недостающие метаданные, проблемы тайминга, несснапленные объекты, одновременные ноты, сломанные длинные ноты и колонки вне режима и переносит вас к каждой находке.",
      keywords:
        "osu mania aimod, проверка карты, osu mania проверка, несснапленные ноты, одновременные объекты, ranking criteria, проверка сета, моддинг osu mania",
      ogTitle: "Проверьте карту osu!mania перед загрузкой",
      ogDescription:
        "Метаданные, тайминг, снап, длинные ноты и ошибки колонок за один проход, с переходом к каждой находке.",
      h1: "Найдите проблемы раньше, чем их найдёт моддер",
      lead: `      <p>
        Большинство замечаний в первом моде вообще не про вкус. Это
        несснапленные объекты, сложность без красной линии, две ноты в одной
        колонке, длинная нота длиной в миллисекунду. <strong>AiMod</strong> в
        Cascade прочёсывает весь сет именно на такие проблемы, чтобы отзывы,
        которые вы получаете, были действительно про маппинг.
      </p>`,
      cta: "Открыть редактор и запустить AiMod",
      body: `      <h2>Что проверяется</h2>
      <ul>
        <li><strong>Метаданные</strong>: отсутствие романизированного названия, исполнителя или автора и пустое поле тегов.</li>
        <li><strong>Сет</strong>: не загружено аудио, нет сложностей, сложности с одинаковыми именами и сет, смешивающий количество клавиш.</li>
        <li><strong>Тайминг</strong>: сложность без красной линии, объекты до первой точки тайминга, недопустимые значения BPM, дублирующиеся точки и зелёные линии перед первой красной.</li>
        <li><strong>Снап</strong>: объекты и концы длинных нот, не попадающие в сетку.</li>
        <li><strong>Ноты</strong>: одновременные объекты в одной колонке, длинные ноты, заканчивающиеся раньше начала, слишком короткие длинные ноты и объекты в колонках вне выбранного режима.</li>
      </ul>

      <h2>Ошибки и предупреждения — разные вещи</h2>
      <p>
        Всё, помеченное как <strong>ошибка</strong>, либо ломает файл, либо
        приведёт к отклонению сета: нет автора, карта без тайминга, нота в пятой
        колонке 4K-сложности. <strong>Предупреждение</strong> — это то, на что
        стоит взглянуть и, возможно, оставить как есть, например сет, который
        осознанно смешивает режимы.
      </p>

      <h2>Переход прямо к проблеме</h2>
      <p>
        Каждая находка называет сложность, из которой она пришла, поэтому даже
        сет из восьми карт даёт список, который можно спокойно пройти, а не
        стену текста. Исправили, запустили заново, список стал короче.
      </p>

      <p class="note">
        AiMod проверяет структуру, а не вкус. Он никогда не скажет, что паттерн
        скучный, и не заменяет настоящий мод.
      </p>`,
    },
    "zh-CN": {
      navLabel: "上传前检查谱面",
      title: "osu!mania AiMod：上传前检查你的谱面 | Cascade",
      description:
        "在浏览器里对整套 osu!mania 谱面做一次完整检查。Cascade 会标出缺失的元数据、时间轴问题、未对齐的物件、重叠音符、损坏的长条以及超出键位的列，并可直接跳到每一处。",
      keywords:
        "osu mania aimod, 谱面检查, osu mania 检查, 未对齐音符, 重叠物件, ranking criteria, 谱面验证, osu mania modding",
      ogTitle: "上传前先检查你的 osu!mania 谱面",
      ogDescription:
        "元数据、时间轴、对齐、长条和列错误，一次扫描全部标出，并能跳到每一处。",
      h1: "在 modder 发现之前先找出问题",
      lead: `      <p>
        第一次收到 mod 时，大多数意见其实和审美无关：未对齐的物件、没有红线的难度、
        同一列里叠了两个音符、只有一毫秒长的长条。Cascade 的 <strong>AiMod</strong>
        会针对这一类问题扫描整套谱面，让你真正收到的反馈是关于排键本身的。
      </p>`,
      cta: "打开编辑器并运行 AiMod",
      body: `      <h2>它会检查什么</h2>
      <ul>
        <li><strong>元数据</strong>：缺少罗马音标题、艺术家或作者，以及标签为空。</li>
        <li><strong>谱面集</strong>：没有加载音频、没有难度、难度重名，以及键数混用的谱面集。</li>
        <li><strong>时间轴</strong>：难度没有红线、物件早于第一个时间点、BPM 数值非法、时间点重复，以及绿线出现在第一条红线之前。</li>
        <li><strong>对齐</strong>：没有落在节拍网格上的物件和长条尾部。</li>
        <li><strong>音符</strong>：同一列中的重叠物件、结束早于开始的长条、短到无法游玩的长条，以及超出键数范围的列。</li>
      </ul>

      <h2>错误和警告不是一回事</h2>
      <p>
        标记为<strong>错误</strong>的问题，要么会让文件损坏，要么会导致谱面被拒：
        缺少作者、没有时间轴的谱面、4K 难度里出现在第五列的音符。
        <strong>警告</strong>则是值得看一眼、也可能刻意保留的东西，
        比如一个有意混用键数的谱面集。
      </p>

      <h2>直接跳到问题所在</h2>
      <p>
        每条结果都会标明它来自哪个难度，所以即使一套有八个难度，
        你拿到的也是一份可以逐条处理的清单，而不是一大段文字。
        改完再跑一次，看着清单变短。
      </p>

      <p class="note">
        AiMod 检查的是结构，不是审美。它永远不会告诉你某段排键无聊，也不能替代真正的 mod。
      </p>`,
    },
    "pt-BR": {
      navLabel: "Checar o mapa antes de enviar",
      title: "osu!mania AiMod: cheque seu mapa antes de enviar | Cascade",
      description:
        "Rode uma checagem completa no seu mapset de osu!mania pelo navegador. O Cascade aponta metadados faltando, problemas de timing, objetos fora da grade, notas simultâneas, notas longas quebradas e colunas fora do alcance, e leva você até cada um.",
      keywords:
        "osu mania aimod, verificador de beatmap, checar mapa osu mania, notas fora da grade, objetos simultaneos, ranking criteria, validacao de mapset, modding osu mania",
      ogTitle: "Cheque seu mapa de osu!mania antes de enviar",
      ogDescription:
        "Metadados, timing, grade, notas longas e erros de coluna, tudo em uma passada, com um pulo até cada problema.",
      h1: "Ache os problemas antes que um modder ache",
      lead: `      <p>
        A maior parte das observações de um primeiro mod não é sobre gosto. São
        objetos fora da grade, uma dificuldade sem linha vermelha, duas notas
        empilhadas na mesma coluna, uma nota longa de um milissegundo. O
        <strong>AiMod</strong> do Cascade varre o mapset inteiro exatamente
        atrás desse tipo de problema, para que o retorno que você receber seja
        sobre o mapeamento.
      </p>`,
      cta: "Abrir o editor e rodar o AiMod",
      body: `      <h2>O que ele checa</h2>
      <ul>
        <li><strong>Metadados</strong>: título, artista ou criador romanizados faltando, e campo de tags vazio.</li>
        <li><strong>Mapset</strong>: sem áudio carregado, sem dificuldades, dificuldades com o mesmo nome e um set que mistura contagens de teclas.</li>
        <li><strong>Timing</strong>: dificuldade sem linha vermelha, objetos antes do primeiro ponto de timing, BPM inválido, pontos duplicados e linhas verdes antes da primeira vermelha.</li>
        <li><strong>Grade</strong>: objetos e finais de notas longas que não caem na grade de tempo.</li>
        <li><strong>Notas</strong>: objetos simultâneos na mesma coluna, notas longas que terminam antes de começar, notas longas curtas demais e objetos em colunas fora da contagem de teclas.</li>
      </ul>

      <h2>Erro e aviso não são a mesma coisa</h2>
      <p>
        O que aparece como <strong>erro</strong> quebra o arquivo ou faz o set
        ser rejeitado: criador faltando, um mapa sem timing, uma nota na coluna
        cinco de uma dificuldade 4K. Um <strong>aviso</strong> é algo para
        olhar e possivelmente manter, como um set que mistura contagens de
        teclas de propósito.
      </p>

      <h2>Pule direto para o problema</h2>
      <p>
        Cada achado diz de qual dificuldade veio, então um set com oito mapas
        ainda te dá uma lista para percorrer em vez de um muro de texto.
        Corrija, rode de novo e veja a lista encolher.
      </p>

      <p class="note">
        O AiMod checa estrutura, não gosto. Ele nunca vai dizer que um padrão é
        chato, e não substitui um mod de verdade.
      </p>`,
    },
  },
};

const timing = {
  slug: "osu-mania-bpm-finder",
  structured: (c, url) => ({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: c.howToName,
    description: c.ogDescription,
    totalTime: "PT2M",
    tool: { "@type": "HowToTool", name: "Cascade" },
    url,
    step: c.steps.map((s) => ({
      "@type": "HowToStep",
      name: s.name,
      text: s.text,
    })),
  }),
  content: {
    en: {
      navLabel: "Find BPM and offset",
      title: "BPM and Offset Finder for osu!mania Maps | Cascade",
      description:
        "Time a song in the browser. Cascade detects the BPM from the audio itself, lets you tap along to confirm it, runs a metronome over the result and nudges the offset until the beat lines sit on the sound.",
      keywords:
        "bpm finder, osu mania timing, find bpm of a song, offset finder, tap bpm, osu mania offset, beatmap timing, metronome, bpm detector online",
      ogTitle: "Find the BPM and offset of any song, in the browser",
      ogDescription:
        "Detect BPM from the audio, tap to confirm, run a metronome over it and nudge the offset until it locks.",
      howToName: "How to time a song for an osu!mania map",
      steps: [
        { name: "Load the audio", text: "Drop an audio file into Cascade to start a map." },
        { name: "Detect the BPM", text: "Cascade analyses the waveform and proposes a tempo." },
        { name: "Tap to confirm", text: "Tap along with the song and compare the tapped tempo with the detected one." },
        { name: "Set the offset", text: "Put the playhead on the first beat and set the offset from it, then nudge in small steps." },
        { name: "Check with the metronome", text: "Play the song with the metronome on until the click sits exactly on the beat." },
      ],
      h1: "Find the BPM and offset of any song",
      lead: `      <p>
        Timing is the part of mapping that nothing else survives without. If the
        BPM is off by a hundredth or the offset is off by a few milliseconds,
        every snapped note in the chart is wrong and no amount of good patterning
        saves it. Cascade gives you three ways to get it right and a metronome to
        prove it.
      </p>`,
      cta: "Open the editor and start timing",
      body: `      <h2>Detected from the audio</h2>
      <p>
        Drop in a song and Cascade analyses the waveform to propose a tempo
        before you have tapped anything. For a track with a steady beat that is
        usually the answer, or close enough that a small nudge finishes the job.
      </p>

      <h2>Tap it yourself</h2>
      <p>
        Tap tempo is still the most reliable check for anything the detector
        finds ambiguous, like a song with a heavy off-beat or a slow intro. Tap
        along for a few bars and Cascade averages your taps into a BPM and an
        offset you can apply directly. If your tapped tempo and the detected one
        agree, you are done.
      </p>

      <h2>Nail the offset</h2>
      <p>
        Put the playhead on the first beat and set the offset from it, then
        nudge in small steps while the song plays. Turn the metronome on and the
        click either sits exactly on the sound or it does not, which is a far
        faster test than staring at the waveform.
      </p>

      <h2>BPM changes and gimmicks</h2>
      <p>
        Songs that speed up, slow down or drop a bar get more red lines, each
        with its own tempo, and the beat grid follows. Once the timing is right,
        the snap divisor actually means something and you can build the chart on
        top of it, then add
        <a href="/osu-mania-sv-editor">scroll velocity</a> for effects that move
        the notes without moving them in time.
      </p>

      <p class="note">
        Timing first, patterns second. Re-timing a finished chart means
        re-snapping every note in it.
      </p>`,
    },
    de: {
      navLabel: "BPM und Offset finden",
      title: "BPM- und Offset-Finder für osu!mania-Maps | Cascade",
      description:
        "Time einen Song im Browser. Cascade erkennt die BPM direkt aus dem Audio, du kannst zur Bestätigung mittappen, ein Metronom darüberlegen und den Offset anpassen, bis die Beatlinien auf dem Klang sitzen.",
      keywords:
        "bpm finder, osu mania timing, bpm eines songs finden, offset finden, bpm tappen, osu mania offset, beatmap timing, metronom, bpm zähler online",
      ogTitle: "Finde BPM und Offset jedes Songs im Browser",
      ogDescription:
        "BPM aus dem Audio erkennen, per Tap bestätigen, Metronom darüberlegen und den Offset feinjustieren.",
      howToName: "So timest du einen Song für eine osu!mania-Map",
      steps: [
        { name: "Audio laden", text: "Ziehe eine Audiodatei in Cascade, um eine Map zu starten." },
        { name: "BPM erkennen", text: "Cascade analysiert die Wellenform und schlägt ein Tempo vor." },
        { name: "Zur Bestätigung tappen", text: "Tappe zum Song mit und vergleiche dein Tempo mit dem erkannten." },
        { name: "Offset setzen", text: "Setze die Abspielposition auf den ersten Beat, übernimm den Offset und justiere in kleinen Schritten." },
        { name: "Mit Metronom prüfen", text: "Spiele den Song mit eingeschaltetem Metronom, bis der Klick genau auf dem Beat liegt." },
      ],
      h1: "Finde BPM und Offset jedes Songs",
      lead: `      <p>
        Timing ist der Teil des Mappings, ohne den nichts anderes überlebt.
        Stimmt die BPM um ein Hundertstel nicht oder der Offset um ein paar
        Millisekunden, ist jede gesnappte Note falsch, und kein gutes Patterning
        rettet das. Cascade bietet dir drei Wege zum richtigen Wert und ein
        Metronom als Beweis.
      </p>`,
      cta: "Editor öffnen und timen",
      body: `      <h2>Aus dem Audio erkannt</h2>
      <p>
        Zieh einen Song hinein und Cascade analysiert die Wellenform und
        schlägt ein Tempo vor, bevor du überhaupt getappt hast. Bei einem Track
        mit gleichmäßigem Beat ist das meist schon die Antwort oder nah genug,
        dass eine kleine Korrektur reicht.
      </p>

      <h2>Selbst tappen</h2>
      <p>
        Tap-Tempo bleibt die verlässlichste Kontrolle für alles, was die
        Erkennung nicht eindeutig findet, etwa Songs mit starkem Offbeat oder
        langsamem Intro. Tappe ein paar Takte mit, und Cascade mittelt daraus
        BPM und Offset, die du direkt übernehmen kannst. Stimmen getapptes und
        erkanntes Tempo überein, bist du fertig.
      </p>

      <h2>Den Offset treffen</h2>
      <p>
        Setze die Abspielposition auf den ersten Beat, übernimm den Offset und
        justiere dann in kleinen Schritten, während der Song läuft. Schalte das
        Metronom ein: Der Klick liegt entweder genau auf dem Klang oder nicht,
        und das ist deutlich schneller geprüft als am Wellenbild.
      </p>

      <h2>Tempowechsel und Gimmicks</h2>
      <p>
        Songs, die schneller oder langsamer werden, bekommen mehr rote Linien
        mit eigenem Tempo, und das Raster folgt. Sobald das Timing stimmt,
        bedeutet der Snap-Teiler wirklich etwas, und du kannst die Map darauf
        aufbauen.
      </p>

      <p class="note">
        Erst timen, dann mappen. Eine fertige Map neu zu timen heißt, jede Note
        darin neu zu snappen.
      </p>`,
    },
    ru: {
      navLabel: "Найти BPM и оффсет",
      title: "Поиск BPM и оффсета для карт osu!mania | Cascade",
      description:
        "Отаймингуйте песню в браузере. Cascade определяет BPM прямо из аудио, позволяет подтвердить его отстукиванием, включает метроном поверх результата и подводит оффсет, пока линии долей не встанут на звук.",
      keywords:
        "поиск bpm, osu mania тайминг, найти bpm песни, поиск оффсета, отстукать bpm, osu mania offset, тайминг карты, метроном, определитель bpm онлайн",
      ogTitle: "Найдите BPM и оффсет любой песни в браузере",
      ogDescription:
        "Определите BPM из аудио, подтвердите отстукиванием, включите метроном и подведите оффсет.",
      howToName: "Как отайминговать песню для карты osu!mania",
      steps: [
        { name: "Загрузите аудио", text: "Перетащите аудиофайл в Cascade, чтобы начать карту." },
        { name: "Определите BPM", text: "Cascade анализирует волновую форму и предлагает темп." },
        { name: "Подтвердите отстукиванием", text: "Постучите в такт песне и сравните полученный темп с определённым." },
        { name: "Задайте оффсет", text: "Поставьте позицию воспроизведения на первую долю, возьмите оффсет оттуда и подводите малыми шагами." },
        { name: "Проверьте метрономом", text: "Играйте песню с включённым метрономом, пока щелчок не ляжет точно на долю." },
      ],
      h1: "Найдите BPM и оффсет любой песни",
      lead: `      <p>
        Тайминг — та часть маппинга, без которой не выживает ничего остальное.
        Если BPM ошибается на сотую, а оффсет на несколько миллисекунд, то
        каждая снапнутая нота стоит неправильно, и никакое хорошее паттернинг
        этого не спасёт. Cascade даёт три способа попасть точно и метроном,
        чтобы это доказать.
      </p>`,
      cta: "Открыть редактор и начать тайминг",
      body: `      <h2>Определение из аудио</h2>
      <p>
        Перетащите песню, и Cascade проанализирует волновую форму и предложит
        темп ещё до того, как вы что-то отстучали. Для трека с ровным битом это
        обычно и есть ответ или достаточно близко, чтобы небольшая правка
        закончила дело.
      </p>

      <h2>Отстучите сами</h2>
      <p>
        Отстукивание остаётся самой надёжной проверкой для всего, что
        определитель считает неоднозначным: песни с сильным офф-битом или
        медленным вступлением. Постучите несколько тактов, и Cascade усреднит
        удары в BPM и оффсет, которые можно применить сразу. Если ваш темп и
        определённый совпали, дело сделано.
      </p>

      <h2>Точный оффсет</h2>
      <p>
        Поставьте позицию воспроизведения на первую долю, возьмите оффсет
        оттуда и подводите его малыми шагами прямо во время игры. Включите
        метроном: щелчок либо ложится ровно на звук, либо нет, и это гораздо
        более быстрый тест, чем разглядывание волновой формы.
      </p>

      <h2>Смены темпа и гиммики</h2>
      <p>
        Песни, которые ускоряются или замедляются, получают больше красных
        линий со своим темпом, и сетка следует за ними. Как только тайминг
        верен, делитель снапа начинает что-то значить, и на нём уже можно
        строить карту.
      </p>

      <p class="note">
        Сначала тайминг, потом паттерны. Переделать тайминг готовой карты
        означает заново снапнуть каждую ноту в ней.
      </p>`,
    },
    "zh-CN": {
      navLabel: "找 BPM 和偏移",
      title: "osu!mania 谱面的 BPM 与偏移查找器 | Cascade",
      description:
        "在浏览器里给歌曲对时间轴。Cascade 能直接从音频识别 BPM，你可以跟着敲击确认，用节拍器覆盖检验，并微调偏移直到节拍线正好落在声音上。",
      keywords:
        "bpm 查找, osu mania 时间轴, 找歌曲 bpm, 偏移查找, 敲击 bpm, osu mania offset, 谱面时间轴, 节拍器, 在线 bpm 检测",
      ogTitle: "在浏览器里找出任意歌曲的 BPM 和偏移",
      ogDescription: "从音频识别 BPM，敲击确认，用节拍器检验，并微调偏移直到对齐。",
      howToName: "如何为 osu!mania 谱面对好时间轴",
      steps: [
        { name: "加载音频", text: "把音频文件拖进 Cascade 来开始一张谱面。" },
        { name: "识别 BPM", text: "Cascade 会分析波形并给出一个速度建议。" },
        { name: "敲击确认", text: "跟着歌曲敲击，把敲出来的速度和识别到的速度做对比。" },
        { name: "设置偏移", text: "把播放头放在第一拍上，据此设置偏移，然后小步微调。" },
        { name: "用节拍器检验", text: "开着节拍器播放歌曲，直到咔哒声正好落在拍点上。" },
      ],
      h1: "找出任意歌曲的 BPM 和偏移",
      lead: `      <p>
        时间轴是做图里其他一切赖以存在的部分。BPM 差了百分之一，或者偏移差了几毫秒，
        谱面里每一颗对齐过的音符都是错的，再好的排键也救不回来。
        Cascade 提供三种把它做对的方式，还有一个节拍器来证明。
      </p>`,
      cta: "打开编辑器开始对时间轴",
      body: `      <h2>从音频中识别</h2>
      <p>
        拖入一首歌，Cascade 会分析波形，在你还没敲任何东西之前就给出速度建议。
        对于节拍稳定的曲子，这通常就是答案，或者已经接近到只需要一点微调。
      </p>

      <h2>自己敲一遍</h2>
      <p>
        对于识别器判断模糊的情况，比如重后拍或者慢速前奏的歌，敲击定速仍然是最可靠的核对方式。
        跟着敲几个小节，Cascade 会把你的敲击平均成可以直接应用的 BPM 和偏移。
        如果你敲出来的速度和识别到的一致，那就搞定了。
      </p>

      <h2>把偏移对准</h2>
      <p>
        把播放头放到第一拍上并据此设置偏移，然后一边播放一边小步微调。
        打开节拍器，咔哒声要么正好落在声音上，要么没有，
        这比盯着波形看要快得多。
      </p>

      <h2>变速与花招</h2>
      <p>
        会加速、减速或者少一拍的歌需要更多红线，每条有自己的速度，节拍网格会跟着走。
        时间轴一旦正确，对齐分度才真正有意义，你才能在它上面搭建谱面。
      </p>

      <p class="note">
        先对时间轴，再排键。给做完的谱面重新对时间轴，意味着要把里面每一颗音符重新对齐。
      </p>`,
    },
    "pt-BR": {
      navLabel: "Achar BPM e offset",
      title: "Buscador de BPM e offset para mapas de osu!mania | Cascade",
      description:
        "Faça o timing de uma música no navegador. O Cascade detecta o BPM a partir do próprio áudio, deixa você bater junto para confirmar, roda um metrônomo por cima e ajusta o offset até as linhas de tempo caírem em cima do som.",
      keywords:
        "buscador de bpm, timing osu mania, achar bpm de musica, achar offset, bater bpm, osu mania offset, timing de beatmap, metronomo, detector de bpm online",
      ogTitle: "Ache o BPM e o offset de qualquer música, no navegador",
      ogDescription:
        "Detecte o BPM pelo áudio, bata junto para confirmar, rode um metrônomo e ajuste o offset até travar.",
      howToName: "Como fazer o timing de uma música para osu!mania",
      steps: [
        { name: "Carregue o áudio", text: "Solte um arquivo de áudio no Cascade para começar um mapa." },
        { name: "Detecte o BPM", text: "O Cascade analisa a forma de onda e propõe um andamento." },
        { name: "Bata para confirmar", text: "Bata junto com a música e compare o andamento batido com o detectado." },
        { name: "Defina o offset", text: "Ponha o cursor no primeiro tempo, defina o offset a partir dele e ajuste em passos pequenos." },
        { name: "Confira no metrônomo", text: "Toque a música com o metrônomo ligado até o clique cair exatamente no tempo." },
      ],
      h1: "Ache o BPM e o offset de qualquer música",
      lead: `      <p>
        Timing é a parte do mapeamento sem a qual nada mais sobrevive. Se o BPM
        estiver errado por um centésimo ou o offset por alguns milissegundos,
        toda nota alinhada do mapa está no lugar errado, e nenhum padrão bom
        salva isso. O Cascade dá três caminhos para acertar e um metrônomo para
        provar.
      </p>`,
      cta: "Abrir o editor e começar o timing",
      body: `      <h2>Detectado pelo áudio</h2>
      <p>
        Solte uma música e o Cascade analisa a forma de onda e propõe um
        andamento antes de você bater qualquer coisa. Numa faixa de batida
        constante isso costuma ser a resposta, ou perto o bastante para um
        pequeno ajuste resolver.
      </p>

      <h2>Bata você mesmo</h2>
      <p>
        Bater o tempo continua sendo a checagem mais confiável para tudo que o
        detector achar ambíguo, como músicas com contratempo forte ou intro
        lenta. Bata junto por alguns compassos e o Cascade tira a média em um
        BPM e um offset que dá para aplicar direto. Se o seu andamento e o
        detectado combinam, acabou.
      </p>

      <h2>Acerte o offset</h2>
      <p>
        Ponha o cursor no primeiro tempo e defina o offset a partir dele, depois
        ajuste em passos pequenos com a música tocando. Ligue o metrônomo: o
        clique cai exatamente em cima do som ou não cai, e isso é um teste bem
        mais rápido do que encarar a forma de onda.
      </p>

      <h2>Mudanças de BPM</h2>
      <p>
        Músicas que aceleram, desaceleram ou comem um compasso ganham mais
        linhas vermelhas, cada uma com seu andamento, e a grade acompanha. Com o
        timing certo, o divisor de alinhamento passa a significar algo e dá para
        construir o mapa em cima dele.
      </p>

      <p class="note">
        Timing primeiro, padrões depois. Refazer o timing de um mapa pronto
        significa realinhar cada nota dele.
      </p>`,
    },
  },
};

export const PAGES = [playtest, collab, aimod, timing];
