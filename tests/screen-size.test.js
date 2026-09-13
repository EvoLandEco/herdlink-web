import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const layoutSource = [
  ...source.matchAll(/^const minimum(?:ViewportWidth|ScreenEdge) = .*;$/gm),
  ...["getHerdLinkLayoutRequirement", "useScreenRequirement"].map((name) =>
    source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m")),
  ),
].map((match) => match[0]).join("\n");

function layout(width, height, screenWidth = 1440, screenHeight = 900) {
  const listeners = new Map();
  let state;
  let cleanup;
  const context = vm.createContext({
    window: {
      innerWidth: width, innerHeight: height,
      screen: { width: screenWidth, height: screenHeight },
      addEventListener: (event, listener) => listeners.set(event, listener),
      removeEventListener: (event) => listeners.delete(event),
    },
    useState(initializer) {
      state = initializer();
      return [state, (value) => { state = value; }];
    },
    useEffect(effect) { cleanup = effect(); },
  });
  vm.runInContext(layoutSource, context);
  context.useScreenRequirement();
  return {
    requirement: () => state,
    resize(nextWidth, nextHeight) {
      Object.assign(context.window, { innerWidth: nextWidth, innerHeight: nextHeight });
      listeners.get("resize")();
    },
    cleanup: () => cleanup(),
    listeners,
  };
}

test("layout requires a landscape viewport and keeps the screen size boundaries", () => {
  assert.equal(layout(720, 719, 600, 800).requirement(), null);
  assert.equal(layout(719, 600).requirement(), "larger-screen");
  assert.equal(layout(720, 720).requirement(), "landscape");
  assert.equal(layout(1200, 800, 599, 900).requirement(), "larger-screen");
  assert.equal(layout(600, 900, 600, 960).requirement(), "landscape");
  assert.equal(layout(900, 1200).requirement(), "landscape");
});

test("phones require a larger screen in either orientation", () => {
  const phone = layout(393, 852, 393, 852);
  assert.equal(phone.requirement(), "larger-screen");
  phone.resize(852, 393);
  assert.equal(phone.requirement(), "larger-screen");
});

test("rotating a tablet or widening a window restores access through resize", () => {
  const tablet = layout(600, 900, 600, 960);
  assert.equal(tablet.requirement(), "landscape");
  tablet.resize(900, 600);
  assert.equal(tablet.requirement(), null);
  tablet.resize(600, 900);
  assert.equal(tablet.requirement(), "landscape");
  tablet.resize(600, 650);
  assert.equal(tablet.requirement(), "larger-screen");
  tablet.resize(720, 650);
  assert.equal(tablet.requirement(), null);
  tablet.cleanup();
  assert.equal(tablet.listeners.size, 0);
});
