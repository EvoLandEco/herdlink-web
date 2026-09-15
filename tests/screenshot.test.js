import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/screenshot.js", import.meta.url), "utf8")
  .replace("export async function", "async function")
  .replace('await import("modern-screenshot")', "await loadRenderer()");

class Element {
  attributes = new Set();
  toggleAttribute(name, present) {
    if (present) this.attributes.add(name);
    else this.attributes.delete(name);
  }
}
class Input extends Element {
  constructor(checked, label = null, appearance = "auto") {
    super();
    Object.assign(this, { checked, label, appearance, style: {} });
  }
  getAttribute(name) { assert.equal(name, "aria-label"); return this.label; }
}
class Select extends Element {
  constructor(id, selected) {
    super();
    this.id = id;
    this.options = selected.map((value) => Object.assign(new Element(), { selected: value }));
  }
}

function stickyNode(originalStyle, painted, flow) {
  let styleText = originalStyle;
  const node = {
    style: new Proxy({}, {
      set(style, property, value) {
        style[property] = value;
        styleText = Object.entries(style).map(([name, item]) => `${name}: ${item};`).join(" ");
        return true;
      },
    }),
    getAttribute(name) { assert.equal(name, "style"); return styleText; },
    setAttribute(name, value) { assert.equal(name, "style"); styleText = value; },
    removeAttribute(name) { assert.equal(name, "style"); styleText = null; },
    getBoundingClientRect() {
      return this.style.position === "relative" ? {
        top: flow.top + parseFloat(this.style.top),
        left: flow.left + parseFloat(this.style.left),
      } : painted;
    },
  };
  return node;
}

function runtime(capture, inert = false) {
  const selected = new Select("simulationModel", [false, true]);
  const mixedInputs = [
    new Input(false, "Allow exports for all regions"),
    new Input(false, "All displayed outgoing links available on this date", "none"),
  ];
  const stickyStyles = [null, "", "color: teal; z-index: 4;"];
  const stickyNodes = stickyStyles.map((style) => stickyNode(
    style, { top: 120, left: 400 }, { top: -80, left: 280 },
  ));
  const theme = new Map([["--color-accent", "#72e4d4"], ["--color-track", "#52667d"], ["color", "white"]]);
  const app = {
    inert,
    children: [{ id: "mainContainer" }],
    getBoundingClientRect: () => ({ width: 1440, height: 900 }),
    querySelectorAll(selector) {
      if (selector === "select") return [selected];
      if (selector === "input:indeterminate") return mixedInputs;
      assert.equal(selector, "*");
      return [...stickyNodes, selected, ...mixedInputs];
    },
  };
  const downloads = [];
  const sliderRule = "input::-webkit-slider-thumb { background: teal; }";
  const context = vm.createContext({
    HTMLInputElement: Input, HTMLSelectElement: Select, URL,
    location: { origin: "http://localhost:5173" },
    window: { devicePixelRatio: 2 },
    getComputedStyle: (node) => node === app ? {
      [Symbol.iterator]: () => theme.keys(),
      getPropertyValue: (property) => theme.get(property),
    } : {
      position: stickyNodes.includes(node) ? "sticky" : "static",
      appearance: node.appearance,
      backgroundColor: "rgb(8, 14, 23)",
    },
    loadRenderer: async () => ({ domToPng: capture }),
    document: {
      fonts: { ready: Promise.resolve() },
      body: {},
      styleSheets: [
        { href: null, cssRules: [
          { selectorText: "input::-webkit-slider-thumb", cssText: sliderRule },
          { selectorText: "body", cssText: "body { color: white; }" },
        ] },
        { href: "https://example.org/icons.css", get cssRules() { assert.fail("Remote CSS rules cannot be read directly"); } },
      ],
      querySelector(selector) { assert.equal(selector, ".screen-access-content"); return app; },
      createElement(tag) {
        if (tag === "style") return {};
        assert.equal(tag, "a");
        return { click() { downloads.push({ filename: this.download, image: this.href }); } };
      },
    },
  });
  vm.runInContext(source, context);
  return { context, app, downloads, sliderRule, stickyNodes, stickyStyles };
}

test("app screenshots retain chart content, form state and slider styles while excluding transient overlays", async () => {
  const { context, app, downloads, sliderRule, stickyNodes, stickyStyles } = runtime(async (target, options) => {
    assert.equal(target, app);
    assert.equal(app.inert, true);
    assert.ok(app.children.every((child) => options.filter(child)));
    assert.equal(options.filter({ id: "introOverlay" }), false);
    assert.equal(options.filter({ id: "herdlinkTooltip" }), false);
    assert.equal(options.width, 1440);
    assert.equal(options.height, 900);
    assert.equal(options.scale, 2);
    assert.equal(options.backgroundColor, "rgb(8, 14, 23)");
    assert.equal(options.features.restoreScrollPosition, true);
    const clonedTheme = new Map();
    options.onCloneNode({
      style: { setProperty: (property, value) => clonedTheme.set(property, value) },
      prepend(style) { assert.equal(style.textContent, sliderRule); },
    });
    assert.deepEqual([...clonedTheme], [["--color-accent", "#72e4d4"], ["--color-track", "#52667d"]]);
    for (const node of stickyNodes) {
      assert.equal(node.style.position, "relative");
      assert.equal(node.style.top, "200px");
      assert.equal(node.style.left, "120px");
      assert.equal(node.style.right, "auto");
      assert.equal(node.style.bottom, "auto");
      assert.deepEqual(node.getBoundingClientRect(), { top: 120, left: 400 });
    }

    for (const checked of [false, true]) {
      const input = new Input(checked);
      input.toggleAttribute("checked", !checked);
      options.onCloneEachNode(input);
      assert.equal(input.attributes.has("checked"), checked);
    }
    const mixed = new Input(false, "Allow exports for all regions");
    options.onCloneEachNode(mixed);
    assert.equal(mixed.style.appearance, "none");
    assert.equal(mixed.style.border, "1px solid var(--color-accent)");
    assert.match(mixed.style.background, /linear-gradient.*60% 2px.*var\(--color-accent\)/);
    const custom = new Input(false, "All displayed outgoing links available on this date", "none");
    options.onCloneEachNode(custom);
    assert.deepEqual(custom.style, {});
    const select = new Select("simulationModel", [true, false]);
    select.options[0].toggleAttribute("selected", true);
    options.onCloneEachNode(select);
    assert.deepEqual(select.options.map((option) => option.attributes.has("selected")), [false, true]);
    return "data:image/png;base64,capture";
  });
  await context.downloadAppScreenshot("herdlink.png");
  assert.equal(app.inert, false);
  assert.deepEqual(stickyNodes.map((node) => node.getAttribute("style")), stickyStyles);
  assert.deepEqual(downloads, [{ filename: "herdlink.png", image: "data:image/png;base64,capture" }]);
});

test("a failed screenshot restores the app's inert state and exact sticky styles without downloading", async () => {
  for (const inert of [false, true]) {
    const error = new Error("Capture failed");
    const { context, app, downloads, stickyNodes, stickyStyles } = runtime(async () => {
      assert.equal(app.inert, true);
      assert.ok(stickyNodes.every((node) => node.style.position === "relative"));
      throw error;
    }, inert);
    await assert.rejects(context.downloadAppScreenshot("herdlink.png"), (reason) => reason === error);
    assert.equal(app.inert, inert);
    assert.deepEqual(stickyNodes.map((node) => node.getAttribute("style")), stickyStyles);
    assert.deepEqual(downloads, []);
  }
});
