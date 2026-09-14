import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";

const source = readFileSync(new URL("../src/components/ScenarioLibrary.jsx", import.meta.url), "utf8");
const icons = source.match(/import \{ ([^}]+) \} from "@fortawesome\/free-solid-svg-icons"/)[1].split(", ");
const { code } = await transform(source.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""), {
  loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment",
});

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...tree.children.flatMap(elements)];
}

function renderer(component) {
  const states = [];
  let stateIndex = 0, idIndex = 0;
  const context = vm.createContext({
    ...Object.fromEntries(icons.map((icon) => [icon, icon])), FontAwesomeIcon: "svg", Fragment: "fragment",
    memo: (render) => render, useId: () => `control-${idIndex++}`, useEffect() {},
    useState: (initial) => {
      const state = states[stateIndex++] ||= { value: initial };
      return [state.value, (value) => { state.value = value; }];
    },
    createElement: (type, props, ...children) => typeof type === "function"
      ? type({ ...props, children }) : { type, props: props || {}, children },
  });
  vm.runInContext(`${code}\nglobalThis.render = ${component};`, context);
  return (props) => {
    stateIndex = 0; idIndex = 0;
    return elements(context.render(props));
  };
}

const Info = ({ children, ...props }) => ({ type: "info", props, children });
const presets = ["open-trade", "seed-containment", "partner-ring", "seed-community", "hub-controls", "trade-bottlenecks", "temporary-standstill"].map((id) => ({
  id, label: id, detail: `Selection for ${id}`, delayDays: 7,
  disabledReason: id === "seed-community" ? "Requires 365 days of history." : null,
}));
const scenarioContext = () => ({
  mode: "trade", presets, settings: { model: "SEIR" }, seedLabel: "CR35",
  presetSettings: { ready: true, introductionDate: "2020-01-01", targetBudget: 3, responseDays: 7, standstillDays: 14 },
});

test("preset buttons retain availability and selection while settings live in Custom", () => {
  const render = renderer("ScenarioPresets");
  const loaded = [];
  const props = { context: scenarioContext(), activePresetId: "seed-containment", onLoadPreset: (id) => loaded.push(id), Info };
  const all = render(props);
  const buttons = all.filter((node) => node.type === "button");
  assert.equal(buttons.length, 7);
  assert.equal(buttons[1].props["aria-pressed"], true);
  assert.equal(buttons[3].props.disabled, true);
  assert.equal(buttons[0].props.disabled, false);
  assert.equal(all.filter((node) => node.type === "input" || node.type === "time").length, 0);
  assert.ok(all.some((node) => node.children.includes("Requires 365 days of history.")));
  buttons[2].props.onClick();
  assert.deepEqual(loaded, ["partner-ring"]);
  props.context.disabled = true;
  assert.ok(render(props).filter((node) => node.type === "button").every((node) => node.props.disabled));
});

test("Custom hosts independent validated target and timing inputs alongside saved slots", () => {
  const render = renderer("ScenarioLibrary");
  const context = scenarioContext();
  const patches = [];
  const props = { id: "custom", open: true, context, slots: [null, null, null], Info,
    onChangePresetSettings: (patch) => {
      patches.push(JSON.parse(JSON.stringify(patch)));
      Object.assign(context.presetSettings, patch);
    },
  };
  const controls = () => render(props).filter((node) => node.props.type === "number");
  assert.deepEqual(controls().map((node) => [node.props.value, node.props.min, node.props.max]), [[3, 1, 40], [7, 0, 365], [14, 1, 365]]);
  const cards = render(props).filter((node) => node.type === "info");
  for (const [label, explanation] of [
    ["Target regions", /Hubs.*Bridges/],
    ["Response delay", /introduction.*intervention/],
    ["Standstill duration", /response.*reopening/],
  ]) {
    const card = cards.find((node) => node.props.label === label);
    assert.ok(card, label);
    assert.ok(card.props.icon);
    assert.ok(card.props.rows.length >= 2);
    assert.match(JSON.stringify([card.children, card.props.rows]), explanation);
    assert.match(card.props.footer, /next time you load a preset/);
  }
  for (const mode of ["trade", "simulation"]) {
    context.mode = mode;
    const all = render(props);
    assert.equal(all.some((node) => node.props.type === "date" || node.type === "time"), false);
    assert.equal(all.filter((node) => node.props.type === "text").length, 3);
    assert.equal(new Set(controls().map((node) => node.props.id)).size, 3);
    for (const input of controls()) {
      assert.ok(all.some((node) => node.props.htmlFor === input.props.id));
      assert.ok(all.some((node) => node.props.id === input.props["aria-describedby"]));
    }
  }
  const edit = (index, value, valid = true) => controls()[index].props.onChange({
    target: { value, valueAsNumber: value === "" ? NaN : Number(value), validity: { valid } },
  });
  edit(0, "");
  assert.equal(controls()[0].props.value, "");
  assert.deepEqual(patches, []);
  edit(1, "0");
  assert.equal(controls()[0].props.value, "");
  assert.equal(controls()[1].props.value, "0");
  edit(0, "5");
  edit(2, "30");
  assert.deepEqual(patches, [{ responseDays: 0 }, { targetBudget: 5 }, { standstillDays: 30 }]);
  for (const [index, value] of [[0, "41"], [1, "366"], [2, "0"]]) {
    edit(index, value, false);
    assert.equal(controls()[index].props.value, value);
    controls()[index].props.onBlur();
  }
  assert.equal(patches.length, 3);
  assert.deepEqual(controls().map((node) => node.props.value), [5, 0, 30]);
  context.disabled = true;
  assert.ok(render(props).filter((node) => ["button", "input"].includes(node.type)).every((node) => node.props.disabled));
  props.open = false;
  assert.equal(render(props)[0].props.hidden, true);
});

test("Custom steppers follow canonical limits and replace drafts independently", () => {
  const render = renderer("ScenarioLibrary");
  const context = scenarioContext();
  const patches = [];
  const props = { id: "custom", open: true, context, slots: [null, null, null], Info,
    onChangePresetSettings: (patch) => {
      patches.push(JSON.parse(JSON.stringify(patch)));
      Object.assign(context.presetSettings, patch);
    },
  };
  const definitions = [
    ["targetBudget", "target regions", 1, 40],
    ["responseDays", "response delay", 0, 365],
    ["standstillDays", "standstill duration", 1, 365],
  ];
  const inputs = () => render(props).filter((node) => node.props.type === "number");
  const button = (action, label) => render(props).find((node) => node.props["aria-label"] === `${action} ${label}`);
  const edit = (index, value, valid = true) => inputs()[index].props.onChange({
    target: { value, valueAsNumber: value === "" ? NaN : Number(value), validity: { valid } },
  });

  for (const [index, [name, label, min, max]] of definitions.entries()) {
    for (const action of ["Decrease", "Increase"]) {
      assert.equal(button(action, label).props.type, "button");
      assert.equal(button(action, label).props["aria-controls"], inputs()[index].props.id);
    }
    context.presetSettings[name] = min;
    assert.equal(button("Decrease", label).props.disabled, true);
    assert.equal(button("Increase", label).props.disabled, false);
    button("Increase", label).props.onClick();
    assert.equal(inputs()[index].props.value, min + 1);
    assert.deepEqual(patches.at(-1), { [name]: min + 1 });
    assert.equal(button("Decrease", label).props.disabled, false);

    context.presetSettings[name] = max;
    assert.equal(button("Increase", label).props.disabled, true);
    assert.equal(button("Decrease", label).props.disabled, false);
    button("Decrease", label).props.onClick();
    assert.equal(inputs()[index].props.value, max - 1);
    assert.deepEqual(patches.at(-1), { [name]: max - 1 });

    const count = patches.length;
    edit(index, "");
    assert.equal(inputs()[index].props.value, "");
    assert.equal(patches.length, count);
    button("Increase", label).props.onClick();
    assert.equal(inputs()[index].props.value, max);
    edit(index, String(max + 1), false);
    assert.equal(button("Increase", label).props.disabled, true);
    button("Decrease", label).props.onClick();
    assert.equal(inputs()[index].props.value, max - 1);
  }

  edit(0, "8");
  edit(1, "0");
  assert.equal(button("Decrease", "response delay").props.disabled, true);
  button("Increase", "target regions").props.onClick();
  assert.equal(inputs()[0].props.value, 9);
  assert.equal(inputs()[1].props.value, "0");
  assert.equal(context.presetSettings.responseDays, 0);
  button("Increase", "response delay").props.onClick();
  assert.equal(inputs()[1].props.value, 1);
  assert.equal(inputs()[0].props.value, 9);

  context.disabled = true;
  for (const [, label] of definitions) for (const action of ["Decrease", "Increase"]) {
    assert.equal(button(action, label).props.disabled, true);
  }
  assert.ok(inputs().every((node) => node.props.disabled));
});
