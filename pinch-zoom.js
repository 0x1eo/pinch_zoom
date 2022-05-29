/**

EDITADO COM O A INTENÇÃO DE SER USADO COM O CHROME NO LINUX
APENAS IMPLEMENTADA A FUNÇÃO DE SHIFT+SCROLL
O NODE DE PITCH NÃO EXISTE OU ENTÃO SOU DEMASIADO BURRO PARA O ENCONTRAR
TALVEZ SEJA UM PROBLEMA COM O DRIVER DE SYNAPTICS NO LINUX
UPDATE: O PINCH FUNCIONA NO FIREFOX, DEVS DO CHROMIUM SÃO CORNOS SÓ :)
REALMENTE NINGUÉM USA LINUX


ATIVA SMOOTH PINCH ZOOM NO DESKTOP (FIREFOX)

Firefox 55+ (modificado para Chrome)

@Author: Leandro Afonso / ldaga
@Website: http://github.com/ldaga0903
@Email: ldaga0903@gmail.com

**/

// parametros de scaling e outras cenas
const scaleMode = 1; // 0 = mantém a qualidade, 1 = diminui a qualidade durante a 'animação'
const minScale = 1.0;
const maxScale = 10;
const zoomSpeedMultiplier = 0.03 / 5;
const overflowTimeout_ms = 400;
const highQualityWait_ms = 40;
const alwaysHighQuality = false;

// settings
let shiftKeyZoom = true; // ativa zoom com shift + scroll por default
let pinchZoomSpeed = 0.7;
let disableScrollbarsWhenZooming = false;

// estado
let pageScale = 1;
let translationX = 0;
let translationY = 0;
let overflowTranslationX = 0;
let overflowTranslationY = 0;

// elementos
let pageElement = document.documentElement;
let scrollBoxElement = document.documentElement; // esta é a scroll-box
let wheelEventElement = document.documentElement;
let scrollEventElement = window;

const quirksMode = document.compatMode === 'BackCompat';

// se o pageElement estiver a faltar um doctype ou o doctype é alterado para < HTML 4.01 depois o Firefox dá render em quirks mode
// não opdemos usar os campos de scroll no elemento <html>, então usamos o body
// "(quirks mode bug 211030) The scrollLeft, scrollTop, scrollWidth, and scrollHeight properties are relative to BODY in quirks mode (instead of HTML)."
// https://bugzilla.mozilla.org/show_bug.cgi?id=211030
if (quirksMode) {
	scrollBoxElement = document.body;
}

// aplicar as definições do user
chrome.storage.local.get([
	'mtzoom_shiftkey',
	'mtzoom_speed',
	'mtzoom_disableScrollbarsWhenZooming',
], function (res) {
	if (res.mtzoom_shiftkey != null) {
		shiftKeyZoom = res.mtzoom_shiftkey;
	}
	if (res.mtzoom_speed != null) {
		pinchZoomSpeed = res.mtzoom_speed;
	}
	if (res.mtzoom_disableScrollbarsWhenZooming != null) {
		disableScrollbarsWhenZooming = res.mtzoom_disableScrollbarsWhenZooming;
	}
});

// optimização de browser-hint - pode causar alguns problemas com certos sites como maps.google.com
// pageElement.style.willChange = 'transform';

// cmd + 0 or ctrl + 0 para restaurar o zoom
window.addEventListener('keydown', (e) => {
	if (e.key == '0' && e.ctrlKey) {
		resetScale();
	}
});

// porque o scroll topo/esquerda são lidados como integers apenas, apenas lê-mos a translation do scroll depois do scroll ter mudado
// se não, a translation iria ter problemas graves de precisão => setTranslationX(4.5) -> translationX = 4
let ignoredScrollLeft = null;
let ignoredScrollTop = null;
function updateTranslationFromScroll(){
	if (scrollBoxElement.scrollLeft !== ignoredScrollLeft) {
		translationX = -scrollBoxElement.scrollLeft;
		ignoredScrollLeft = null;
	}
	if (scrollBoxElement.scrollTop !== ignoredScrollTop) {
		translationY = -scrollBoxElement.scrollTop;
		ignoredScrollTop = null;
	}
}
// https://github.com/rochal/jQuery-slimScroll/issues/316
scrollEventElement.addEventListener(`scroll`, updateTranslationFromScroll, { capture: false, passive: false });

wheelEventElement.addEventListener(`wheel`, (e) => {
	if (e.shiftKey && shiftKeyZoom) {
		if (e.defaultPrevented) return;

		let x = e.clientX - scrollBoxElement.offsetLeft;
		let y = e.clientY - scrollBoxElement.offsetTop;
		// x nas coordenadas non-scrolling, non-transformed relativas ao scrollBoxElement
		// 0 é sempre o lado esquerdo e <width> é sempre o lado direito

		let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;

		let newScale = pageScale + e.deltaY * deltaMultiplier;
		let scaleBy = pageScale/newScale;

		applyScale(scaleBy, x, y, false);

		e.preventDefault();
		e.stopPropagation();
	} else {
		// e.preventDefault();
		restoreControl();
	}
}, { capture: false, passive: false });

scrollBoxElement.addEventListener(`mousemove`, restoreControl);
scrollBoxElement.addEventListener(`mousedown`, restoreControl);

let controlDisabled = false;
function disableControl() {
	if (controlDisabled) return;

	if (disableScrollbarsWhenZooming) {
		let verticalScrollBarWidth = window.innerWidth - pageElement.clientWidth;
		let horizontalScrollBarWidth = window.innerHeight - pageElement.clientHeight;

		// desativar o scrolling para eficiencia
		pageElement.style.setProperty('overflow', 'hidden', 'important');

		// visto que estamos a desativar a scrollbar temos que aplicar uma margem para replicar o offset (se algum) que introduziu
		// isto evita que a página dê shift enquanto a scrollbar é escondidada e mostrada
		pageElement.style.setProperty('margin-right', verticalScrollBarWidth + 'px', 'important');
		pageElement.style.setProperty('margin-bottom', horizontalScrollBarWidth + 'px', 'important');
	}

	// document.body.style.pointerEvents = 'none';
	controlDisabled = true;
}

function restoreControl() {
	if (!controlDisabled) return;
	// o scrolling tem que estar ativado para realizar o panning
	pageElement.style.overflow = 'auto';
	pageElement.style.marginRight = '';
	pageElement.style.marginBottom = '';
	// document.body.style.pointerEvents = '';
	controlDisabled = false;
}

let qualityTimeoutHandle = null;
let overflowTimeoutHandle = null;

function updateTransform(scaleModeOverride, shouldDisableControl) {
	if (shouldDisableControl == null) {
		shouldDisableControl = true;
	}

	let sm = scaleModeOverride == null ? scaleMode : scaleModeOverride;

	if (sm === 0 || alwaysHighQuality) {
		// scaleX/scaleY
		pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
	} else {
		// perspectiva (qualidade reduzida mas mais eficiente)
		let p = 1; // qual é o melhor valor aqui?
		let z = p - p/pageScale;

		pageElement.style.setProperty('transform', `perspective(${p}px) translateZ(${z}px)`, 'important');

		// esperar por um curto momento antes de restaurar a qualidade
		// podemos usar um timeout para um trackpad porque não podemos detetar quando o user terminou o gesto no hardware
		// apenas podemos detetar eventos de updates de gestos 'gestures' ('wheel' + ctrl)
        window.clearTimeout(qualityTimeoutHandle);
        qualityTimeoutHandle = setTimeout(function(){
        pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
        }, highQualityWait_ms);
	}

	pageElement.style.setProperty('transform-origin', '0 0', 'important');

	// 'hack' para restaurar o comportamento normal que se estraga após aplicar o transform
	pageElement.style.position = `relative`;
	pageElement.style.height = `100%`;

	// quando a translation é positiva, o offset é aplicado via posicionamento esquerda/topo
	// translation negativa é aplicadad via scroll
	if (minScale < 1) {
		pageElement.style.setProperty('left', `${Math.max(translationX, 0) - overflowTranslationX}px`, 'important');
		pageElement.style.setProperty('top', `${Math.max(translationY, 0) - overflowTranslationY}px`, 'important');
	}

	// 'hack' de eficiencia esquisito - talvez esteja a dar batch às mudanças?
	pageElement.style.transitionProperty = `transform, left, top`;
	pageElement.style.transitionDuration = `0s`;

	if (shouldDisableControl) {
		disableControl();
		clearTimeout(overflowTimeoutHandle);
		overflowTimeoutHandle = setTimeout(function(){
			restoreControl();
		}, overflowTimeout_ms);
	}
}

function applyScale(scaleBy, x_scrollBoxElement, y_scrollBoxElement) {
	// se o container for a janela, então as coordenadas são relativas à janela
	// ignorar qualquer offset do scroll. as coordenadas não mudam enquanto a página é transformada (hopefully)

	function getTranslationX(){ return translationX; }
	function getTranslationY(){ return translationY; }
	function setTranslationX(v) {
		// 'agrafar' v à range do scroll
		// isto limita a minScale a 1
		v = Math.min(v, 0);
		v = Math.max(v, -(scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth));

		translationX = v;

		scrollBoxElement.scrollLeft = Math.max(-v, 0);
		ignoredScrollLeft = scrollBoxElement.scrollLeft;

		// scroll-transform o que não podemos aplicar
		// ou não há scroll-bar ou queremos dar scroll mesmo depois do fim da página
		overflowTranslationX = v < 0 ? Math.max((-v) - (scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth), 0) : 0;
	}
	function setTranslationY(v) {
		// 'agrafar' v à range do scroll
		// isto limita a minScale a 1
		v = Math.min(v, 0);
		v = Math.max(v, -(scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight));

		translationY = v;

		scrollBoxElement.scrollTop = Math.max(-v, 0);
		ignoredScrollTop = scrollBoxElement.scrollTop;

		overflowTranslationY = v < 0 ? Math.max((-v) - (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight), 0) : 0;
	}

	// alterar tamanho do pageElement
	let pageScaleBefore = pageScale;
	pageScale *= scaleBy;
	pageScale = Math.min(Math.max(pageScale, minScale), maxScale);
	let effectiveScale = pageScale/pageScaleBefore;

	// quando alcançarmos a escala min/max podemos dar exit mais cedo
	if (effectiveScale === 1) return;

	updateTransform(null, null);

    //zx e zy são as coordenadas absolutas do cursor no ecrã
	let zx = x_scrollBoxElement;
	let zy = y_scrollBoxElement;

	// calcular nova xy-translation
	let tx = getTranslationX();
	tx = (tx - zx) * (effectiveScale) + zx;

	let ty = getTranslationY();
	ty = (ty - zy) * (effectiveScale) + zy;

	// aplicar nova xy-translation
	setTranslationX(tx);
	setTranslationY(ty);

	updateTransform(null, null);
}

function resetScale() {
	// reiniciar o estado
	pageScale = 1;
	translationX = 0;
	translationY = 0;
	overflowTranslationX = 0;
	overflowTranslationY = 0;

	let scrollLeftBefore = scrollBoxElement.scrollLeft;
	let scrollLeftMaxBefore = scrollBoxElement.scrollMax;
	let scrollTopBefore = scrollBoxElement.scrollTop;
	let scrollTopMaxBefore = (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight);
	updateTransform(0, false, false);

	// restaurar o scroll
	scrollBoxElement.scrollLeft = (scrollLeftBefore/scrollLeftMaxBefore) * (scrollBoxElement.scrollWidth - scrollBoxElement.clientWidth);
	scrollBoxElement.scrollTop = (scrollTopBefore/scrollTopMaxBefore) * (scrollBoxElement.scrollHeight - scrollBoxElement.clientHeight);

	updateTranslationFromScroll();

	// desfazer as outras mudanças ao CSS
	pageElement.style.overflow = '';
	// document.body.style.pointerEvents = '';
}
