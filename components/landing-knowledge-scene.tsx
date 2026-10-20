export function LandingKnowledgeScene() {
  return (
    <svg viewBox="0 0 1600 900" role="img" aria-label="学生在昼夜变化的书桌前，将零散笔记连接成知识网络的插画">
      <defs>
        <pattern id="landing-film-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="1" />
        </pattern>
        <filter id="landing-film-paper-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#071533" floodOpacity=".2" />
        </filter>
      </defs>

      <rect width="1600" height="900" className="scene-paper" />
      <rect width="1600" height="900" fill="url(#landing-film-grid)" className="scene-grid" />

      <g className="scene-window">
        <rect x="70" y="100" width="440" height="470" rx="2" className="scene-window-frame" />
        <rect x="96" y="126" width="388" height="418" className="scene-window-sky" />
        <path d="M96 444h58v-88h44v54h42V292h64v152h48V330h52v114h80v100H96z" className="scene-city" />
        <path d="M96 390c72-18 126-4 188 18s128 29 200-9" className="scene-horizon" />
        <path d="M290 126v418M96 334h388" className="scene-window-bars" />
      </g>

      <g className="scene-wall-notes">
        <rect x="615" y="112" width="155" height="106" rx="3" />
        <path d="M640 148h80M640 171h100M640 194h58" />
        <rect x="802" y="94" width="124" height="156" rx="3" />
        <path d="M826 130h70M826 154h48M826 179h74M826 204h52" />
        <rect x="960" y="130" width="164" height="116" rx="3" />
        <path d="M986 165h104M986 190h76M986 215h112" />
      </g>

      <g className="scene-desk">
        <path d="M230 657H1490L1600 900H0L92 690z" className="scene-desk-top" />
        <path d="M180 700h1320" className="scene-ink-line" />
        <path d="M282 700l-48 200M1390 700l54 200" className="scene-desk-legs" />
      </g>

      <g className="scene-person">
        <path d="M492 436c0-78 47-128 119-128s126 55 126 132c0 50-23 91-57 115l20 73H512l21-74c-26-23-41-67-41-118z" className="scene-person-head" />
        <path d="M523 332c29-67 116-79 176-26l-20 38c-56-34-100-29-156 17z" className="scene-person-hair" />
        <path d="M522 582c-81 28-128 102-124 213h377c1-91-43-181-110-213-43 30-95 31-143 0z" className="scene-person-body" />
        <path d="M693 650c67 7 116 38 166 96M806 739l64 17" className="scene-person-arm" />
        <circle cx="873" cy="758" r="18" className="scene-person-hand" />
        <path d="M737 415c26-13 58-10 82 4M742 418l-8 31m87-29l8 31" className="scene-glasses" />
      </g>

      <g className="scene-books">
        <path d="M1130 646h245v35h-245zM1162 608h194v38h-194zM1194 566h150v42h-150z" />
        <path d="M1153 620h176M1213 579h105" />
      </g>

      <g className="scene-notes" filter="url(#landing-film-paper-shadow)">
        <g className="scene-note scene-note--1"><rect x="760" y="516" width="186" height="120" /><path d="M790 551h116M790 580h82M790 607h132" /></g>
        <g className="scene-note scene-note--2"><rect x="940" y="430" width="180" height="116" /><circle cx="992" cy="481" r="23" /><path d="M1030 467h58M1030 493h44M970 520h118" /></g>
        <g className="scene-note scene-note--3"><rect x="1110" y="344" width="170" height="112" /><path d="M1140 413l28-31 28 15 34-38M1140 427h102" /></g>
        <g className="scene-note scene-note--4"><rect x="1264" y="478" width="178" height="118" /><path d="M1294 516h112M1294 545h72M1294 570h126" /></g>
        <g className="scene-note scene-note--5"><rect x="1088" y="640" width="182" height="116" /><path d="M1118 681h128M1118 709h82M1118 735h116" /></g>
      </g>

      <g className="scene-connections">
        <path d="M906 575C984 560 1016 532 1032 492" />
        <path d="M1098 471C1142 436 1164 418 1190 400" />
        <path d="M1264 431C1321 439 1350 464 1363 499" />
        <path d="M1331 584C1288 636 1238 666 1208 681" />
        <path d="M1110 690C1016 674 947 631 902 604" />
        <circle cx="906" cy="575" r="7" /><circle cx="1032" cy="492" r="7" /><circle cx="1190" cy="400" r="7" /><circle cx="1363" cy="499" r="7" /><circle cx="1208" cy="681" r="7" />
      </g>

      <g className="scene-lamp">
        <path d="M300 687l48-194 108-87M351 491l77 22" className="scene-ink-line" />
        <path d="M417 360c60 1 101 39 113 91l-118 14c-12-45-9-73 5-105z" />
        <ellipse cx="341" cy="694" rx="74" ry="17" />
      </g>
    </svg>
  );
}
