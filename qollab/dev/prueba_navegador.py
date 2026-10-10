"""Prueba de humo en un navegador sin ventana (Playwright + Chromium).

    python dev/servidor.py &          # en otra terminal
    python dev/prueba_navegador.py [--url http://127.0.0.1:8765] [--salida capturas/]

Comprueba que la página arranca, que el láser produce el quantum walk, que el microcircuito
se simula, que el job corre en el backend y que IonQ queda limitado a un job por ejecución.
"""

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8765")
    ap.add_argument("--salida", default="capturas")
    a = ap.parse_args()
    out = Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)
    errores = []
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pag = nav.new_page(viewport={"width": 1440, "height": 860})
        pag.on("pageerror", lambda e: errores.append(f"pageerror: {e}"))
        pag.on("console", lambda m: m.type == "error" and errores.append(f"console: {m.text}"))

        # 1) backend local: arranca listo para disparar, sin ejecutar nada
        pag.goto(a.url)
        pag.wait_for_selector("#loader.hide", timeout=60000)
        assert pag.is_visible("#chap-1") and not pag.is_visible("#chap-2"), "sólo debe verse el panel 1"
        assert "Fire laser at AVM" in pag.inner_text("#fire-btn")
        print("narración:", pag.inner_text("#narr-text")[:120])
        pag.screenshot(path=str(out / "1_inicio.png"))

        # sonido: botón para silenciar (aria-pressed)
        pag.click("#sound-btn")
        assert pag.get_attribute("#sound-btn", "aria-pressed") == "false" and "off" in pag.inner_text("#sound-btn")
        pag.click("#sound-btn")
        assert pag.get_attribute("#sound-btn", "aria-pressed") == "true"

        # ayuda "?" y ajustes de laboratorio
        pag.click('button.help[data-help="theta"]')
        assert pag.is_visible("#help-pop"), "la ayuda no se abrió"
        pag.keyboard.press("Escape")
        assert not pag.is_visible("#help-pop"), "Esc debe cerrar la ayuda"
        pag.click("#lab-btn")
        assert pag.is_visible("#gamma"), "el cajón de laboratorio no se abrió"
        pag.fill("#casc-pasos", "5")
        pag.screenshot(path=str(out / "1b_lab.png"))
        pag.keyboard.press("Escape")
        assert not pag.is_visible("#lab"), "Esc debe cerrar el laboratorio"

        # panel 2 antes de disparar: el circuito del próximo disparo aparece al instante
        pag.click("#tab-2")
        pag.wait_for_selector("#circ-svg svg .hopbox", timeout=20000)
        print("circuito (preview):", pag.inner_text("#circ-chips").replace("\n", " "))
        pag.wait_for_timeout(400)
        pag.screenshot(path=str(out / "2a_circuito_preview.png"))
        pag.check('input[name="circ-vista"][value="compacta"]', force=True)
        pag.wait_for_selector("#circ-svg svg .ubox", timeout=10000)
        pag.screenshot(path=str(out / "2b_circuito_compacto.png"))
        pag.check('input[name="circ-vista"][value="completa"]', force=True)

        # 2) láser = cascada de circuitos en el backend
        pag.focus("#tab-2")
        pag.keyboard.press("ArrowLeft")
        assert pag.is_visible("#chap-1"), "← debe volver al panel 1"
        pag.focus("#scene")
        for _ in range(4):
            pag.keyboard.press("+")
        pag.fill("#neuron-input", "ALML")
        pag.press("#neuron-input", "Tab")
        assert "ALML" in pag.inner_text("#fire-btn")
        pag.click("#fire-btn")
        pag.wait_for_function("document.querySelector('#narr-kicker').textContent.includes('superposition')", timeout=60000)
        pag.wait_for_timeout(300)
        pag.screenshot(path=str(out / "3a_superposicion.png"))
        pag.wait_for_function("document.querySelector('#narr-kicker').textContent.includes('measured')", timeout=60000)
        pag.screenshot(path=str(out / "3b_colapso.png"))
        pag.wait_for_function("document.querySelector('#casc-stop').disabled && "
                              "document.querySelectorAll('#casc-log li').length > 0", timeout=180000)
        assert pag.is_visible("#mini-circ svg"), "falta el circuito del paso"
        print("cascada:", pag.inner_text("#casc-estado"))
        pag.screenshot(path=str(out / "3c_fin.png"))

        # panel 2 después: el último paso, con sus conteos
        pag.click("#tab-2")
        pag.wait_for_function("document.querySelector('#circ-title').textContent.startsWith('Step')", timeout=20000)
        pag.wait_for_selector("#counts li", timeout=10000)
        print("conteos:", pag.inner_text("#counts").replace("\n", " | ")[:200])
        print("mpl:", pag.inner_text("#fig-estado")[:120])
        pag.wait_for_timeout(600)
        pag.screenshot(path=str(out / "4_circuito_paso.png"), full_page=True)
        pag.select_option("#circ-step", "0")
        pag.wait_for_function("document.querySelector('#circ-title').textContent.startsWith('Step 1')", timeout=10000)

        # 3) IonQ imitado: un job por ejecución
        pag.goto(a.url + "/?backend=ionq")
        pag.wait_for_selector("#loader.hide", timeout=60000)
        print("pill:", pag.inner_text("#backend-pill"))
        pag.click("#fire-btn")
        pag.wait_for_function("document.querySelector('#casc-stop').disabled && "
                              "document.querySelectorAll('#casc-log li').length > 0", timeout=120000)
        assert pag.locator("#casc-log li").count() == 1, "IonQ: un solo paso"
        assert pag.is_disabled("#fire-btn"), "IonQ debería quedar en un job por ejecución"
        print("ionq: 1 paso y botón bloqueado ✓")

        # 4) hardware imitado: pide confirmación
        pag.goto(a.url + "/?backend=qpu")
        pag.wait_for_selector("#loader.hide", timeout=60000)
        pag.click("#fire-btn")
        assert "Confirm" in pag.inner_text("#fire-btn"), "falta la confirmación de hardware"
        print("qpu: pide confirmación ✓")

        # 5) pantalla angosta
        pag.set_viewport_size({"width": 700, "height": 900})
        pag.wait_for_timeout(800)
        pag.screenshot(path=str(out / "5_movil.png"), full_page=True)
        nav.close()
    if errores:
        print("\n".join(errores))
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
