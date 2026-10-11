"""Prueba de humo en un navegador sin ventana (Playwright + Chromium).

    python tools/dev_server.py &      # en otra terminal
    python tests/e2e/smoke_test.py [--url http://127.0.0.1:8765] [--salida capturas/]

Comprueba, como lo haría alguien con teclado y mouse:
  * la intro: arranque → título (foco en PRESS START, página inerte) → 3 escenas con Enter → HUD con
    el foco en el disparo; y que Esc la salta;
  * el disparo con "mantener para cargar" (el medidor de dosis se carga) y la cascada de circuitos en
    el backend, con su logro;
  * el inspector del circuito con la tecla C (y Esc para cerrarlo), con el dibujo y los conteos;
  * IonQ limitado a un job por ejecución, la confirmación en hardware y la versión con
    prefers-reduced-motion;
  * la conducta del gusano: la tabla neurona → conducta (js/conducta.js), el gusano que la actúa tras
    cada paso y que abrir el inspector a mitad de la conducta no traba la cascada.
"""

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
SHOT = {"timeout": 120000}  # con WebGL por software una captura puede tardar


def entrar(pag, completa=False, out=None):
    """Espera el título de la intro; con `completa` la recorre con Enter, si no la salta con Esc."""
    pag.wait_for_function("document.getElementById('intro').dataset.fase === 'titulo'", timeout=90000)
    assert pag.evaluate("document.activeElement.id") == "intro-start", "PRESS START debe tomar el foco"
    assert pag.evaluate("document.getElementById('app').inert"), "la página debe quedar inerte detrás de la intro"
    if completa:
        if out:
            pag.wait_for_timeout(1800)
            pag.screenshot(path=str(out / "0_titulo.png"), **SHOT)
        pag.keyboard.press("Enter")  # PRESS START
        for k in range(3):  # las tres escenas: luz, superposición, colapso
            pag.wait_for_function(f"document.getElementById('brief-num').textContent === '0{k + 1}'", timeout=20000)
            pag.wait_for_timeout(1500)
            if out:
                pag.screenshot(path=str(out / f"0_escena{k + 1}.png"), **SHOT)
            assert pag.evaluate("document.activeElement.id") == "intro-next"
            pag.keyboard.press("Enter")
    else:
        pag.keyboard.press("Escape")
    pag.wait_for_selector("#intro", state="hidden", timeout=20000)
    assert not pag.evaluate("document.getElementById('app').inert")
    assert pag.evaluate("document.activeElement.id") == "fire-btn", "al terminar la intro el foco va al disparo"


def esperar_fin_cascada(pag, timeout=400000):
    pag.wait_for_function("document.querySelector('#casc-stop').disabled && "
                          "document.querySelectorAll('#casc-log li').length > 0", timeout=timeout)


ESPERADO = {"AVAL": "reversa", "AVBR": "avance", "AVM": "reversa", "PLML": "avance", "RIVL": "omega",
            "VA5": "flexion", "DB3": "flexion", "DD2": "relajar", "MCL": "bombeo", "HSNL": "puesta",
            "RIS": "quietud", "ASHL": "escape", "ASIL": None, "ASJL": None, "ASKL": None, "I2L": None}


def cascada_corta(pag, fuente, pasos="3"):
    """Dispara una cascada corta desde `fuente` con la dosis del menú (Enter sobre el disparo)."""
    pag.keyboard.press("Escape")
    pag.fill("#casc-pasos", pasos)
    pag.keyboard.press("Escape")
    pag.fill("#neuron-input", fuente)
    pag.press("#neuron-input", "Tab")
    pag.focus("#fire-btn")
    pag.keyboard.press("Enter")


def probar_conducta(nav, url, out, errores):
    """La tabla neurona → conducta y el gusano que la actúa tras cada paso."""
    pag = nav.new_page(viewport={"width": 1440, "height": 900})
    pag.on("pageerror", lambda e: errores.append(f"pageerror (conducta): {e}"))
    pag.goto(url)
    entrar(pag)
    tabla = pag.evaluate("""async (esperado) => {
      const m = await import('/js/conducta.js');
      const nombres = [...document.querySelectorAll('#neuron-list option')].map((o) => o.value);
      const mal = Object.entries(esperado).filter(([n, p]) => (m.conductaDe(n)?.programa ?? null) !== p);
      const motor = new m.Motor();
      return { mal, n: nombres.length, mapeadas: nombres.filter((n) => m.conductaDe(n)).length,
               lados: [motor.aplicar('VA5').lado, motor.aplicar('DB3').lado] };
    }""", ESPERADO)
    assert not tabla["mal"], f"conducta equivocada: {tabla['mal']}"
    assert tabla["n"] == 302 and tabla["lados"] == [-1, 1], tabla
    print(f"conducta: {tabla['mapeadas']}/302 neuronas con conducta ✓")

    # AVM (tacto anterior): tras la medida aparece la conducta en el escáner
    cascada_corta(pag, "AVM")
    pag.wait_for_function("document.querySelector('#narr-kicker').textContent.toLowerCase().includes('measured')",
                          timeout=120000)
    pag.wait_for_timeout(900)
    pag.screenshot(path=str(out / "6_conducta.png"), **SHOT)
    esperar_fin_cascada(pag)
    assert "worm" in pag.inner_text("#casc-chips").lower(), "falta el chip de conducta"
    assert "Waiting" not in pag.inner_text("#casc-conducta"), "no se describió la conducta"
    print("conducta:", pag.inner_text("#casc-conducta")[:120])

    # abrir el inspector (C) a mitad de la conducta no traba la cascada (el lienzo pausado la termina)
    cascada_corta(pag, "AVAL")
    pag.wait_for_function("document.querySelector('#narr-kicker').textContent.toLowerCase().includes('measured')",
                          timeout=120000)
    pag.focus("#scene")
    pag.keyboard.press("c")
    esperar_fin_cascada(pag, 200000)
    pag.keyboard.press("Escape")
    print("conducta: inspector a mitad de la conducta, la cascada termina ✓")
    pag.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8765")
    ap.add_argument("--salida", default="capturas")
    a = ap.parse_args()
    out = Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)
    errores = []
    with sync_playwright() as p:
        nav = p.chromium.launch(args=ARGS)
        pag = nav.new_page(viewport={"width": 1440, "height": 900})
        pag.on("pageerror", lambda e: errores.append(f"pageerror: {e}"))
        pag.on("console", lambda m: m.type == "error" and errores.append(f"console: {m.text}"))

        # 1) intro completa con el teclado
        pag.goto(a.url)
        entrar(pag, completa=True, out=out)
        assert "fire at avm" in pag.inner_text("#fire-btn").lower()
        print("narración:", pag.inner_text("#narr-text")[:110])
        pag.wait_for_timeout(1200)
        pag.screenshot(path=str(out / "1_hud.png"), **SHOT)

        # sonido, ayuda y menú (Esc)
        pag.click("#sound-btn")
        assert pag.get_attribute("#sound-btn", "aria-pressed") == "false"
        pag.click("#sound-btn")
        assert pag.get_attribute("#sound-btn", "aria-pressed") == "true"
        pag.click('button.help[data-help="theta"]')
        assert pag.is_visible("#help-pop"), "la ayuda no se abrió"
        pag.keyboard.press("Escape")
        assert not pag.is_visible("#help-pop"), "Esc debe cerrar la ayuda"
        pag.keyboard.press("Escape")
        assert pag.is_visible("#lab"), "Esc (sin nada abierto) abre el menú"
        pag.fill("#casc-pasos", "5")
        pag.screenshot(path=str(out / "1b_menu.png"), **SHOT)
        pag.keyboard.press("Escape")
        assert not pag.is_visible("#lab"), "Esc cierra el menú"

        # inspector antes de disparar (tecla C): el circuito del próximo disparo
        pag.focus("#scene")
        pag.keyboard.press("c")
        assert pag.is_visible("#inspector"), "C debe abrir el inspector"
        pag.wait_for_selector("#circ-svg svg .hopbox", timeout=60000)
        print("circuito (preview):", pag.inner_text("#circ-chips").replace("\n", " "))
        pag.check('input[name="circ-vista"][value="compacta"]', force=True)
        pag.wait_for_selector("#circ-svg svg .ubox", timeout=20000)
        pag.check('input[name="circ-vista"][value="completa"]', force=True)
        pag.keyboard.press("Escape")
        assert not pag.is_visible("#inspector"), "Esc cierra el inspector"

        # 2) disparo cargado con el mouse sobre ALML
        pag.fill("#neuron-input", "ALML")
        pag.press("#neuron-input", "Tab")
        assert "ALML" in pag.inner_text("#fire-btn")
        caja = pag.locator("#fire-btn").bounding_box()
        pag.mouse.move(caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2)
        pag.mouse.down()
        pag.wait_for_function("document.getElementById('dose-meter').classList.contains('charging')", timeout=5000)
        pag.wait_for_timeout(500)
        print("cargando: θ =", pag.inner_text("#theta-val"), "· disparo", pag.inner_text("#pfire"))
        pag.mouse.up()
        pag.wait_for_selector(".achv", timeout=20000)
        print("logro:", pag.inner_text(".achv .t"))
        pag.wait_for_function("document.querySelector('#narr-kicker').textContent.toLowerCase().includes('superposition')",
                              timeout=120000)
        pag.screenshot(path=str(out / "2a_superposicion.png"), **SHOT)
        esperar_fin_cascada(pag)
        assert pag.is_visible("#mini-circ svg"), "falta el circuito del paso"
        print("cascada:", pag.inner_text("#casc-estado"))
        print("estadísticas:", pag.inner_text("#hud-stats").replace("\n", " "))
        pag.screenshot(path=str(out / "2b_fin.png"), **SHOT)

        # el inspector después: el último paso con sus conteos
        pag.focus("#scene")
        pag.keyboard.press("c")
        pag.wait_for_function("document.querySelector('#circ-title').textContent.startsWith('Step')", timeout=30000)
        pag.wait_for_selector("#counts li", timeout=20000)
        print("conteos:", pag.inner_text("#counts").replace("\n", " | ")[:160])
        pag.screenshot(path=str(out / "3_inspector.png"), **SHOT)
        pag.select_option("#circ-step", "0")
        pag.wait_for_function("document.querySelector('#circ-title').textContent.startsWith('Step 1')", timeout=180000)
        pag.keyboard.press("Escape")

        # 3) IonQ imitado: un job por ejecución (disparo con Enter = dosis del menú)
        pag.goto(a.url + "/?backend=ionq")
        entrar(pag)
        print("pill:", pag.inner_text("#backend-pill"))
        pag.keyboard.press("Enter")
        esperar_fin_cascada(pag, 120000)
        assert pag.locator("#casc-log li").count() == 1, "IonQ: un solo paso"
        assert pag.is_disabled("#fire-btn"), "IonQ debería quedar en un job por ejecución"
        print("ionq: 1 paso y botón bloqueado ✓")

        # 4) hardware imitado: un toque pide confirmación
        pag.goto(a.url + "/?backend=qpu")
        entrar(pag)
        pag.click("#fire-btn")
        assert "confirm" in pag.inner_text("#fire-btn").lower(), "falta la confirmación de hardware"
        print("qpu: pide confirmación ✓")

        # 5) pantalla angosta
        pag.set_viewport_size({"width": 700, "height": 900})
        pag.wait_for_timeout(1000)
        pag.screenshot(path=str(out / "5_angosta.png"), **SHOT)
        probar_conducta(nav, a.url, out, errores)
        nav.close()

        # 6) prefers-reduced-motion: la intro se salta y la cascada corre sin animaciones
        nav = p.chromium.launch(args=ARGS)
        ctx = nav.new_context(viewport={"width": 1280, "height": 860}, reduced_motion="reduce")
        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errores.append(f"pageerror (reduced): {e}"))
        pag.goto(a.url)
        entrar(pag)
        pag.keyboard.press("Escape")
        pag.fill("#casc-pasos", "3")
        pag.keyboard.press("Escape")
        pag.focus("#fire-btn")
        pag.keyboard.press("Enter")
        esperar_fin_cascada(pag, 180000)
        print("reduced motion:", pag.inner_text("#casc-estado"))
        assert "worm" in pag.inner_text("#casc-chips").lower(), "reduced motion: falta el chip de conducta"
        nav.close()
    if errores:
        print("\n".join(errores))
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
