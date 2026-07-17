const { getByPath, setByPath, resolveValue, interpolate } = require("../expression/engine");

/**
 * Variable store for workflow executions.
 * Layers: secrets < env < global < workflow < inputs < outputs < node outputs
 */
class VariableStore {
  constructor(initial = {}) {
    this.layers = {
      secrets: { ...(initial.secrets || {}) },
      env: { ...(initial.env || process.env), ...(initial.env || {}) },
      global: { ...(initial.global || {}) },
      workflow: { ...(initial.workflow || {}) },
      inputs: { ...(initial.inputs || {}) },
      outputs: { ...(initial.outputs || {}) },
      nodes: { ...(initial.nodes || {}) },
    };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.layers));
  }

  flat() {
    return {
      ...this.layers.env,
      ...this.layers.global,
      ...this.layers.workflow,
      ...this.layers.inputs,
      ...this.layers.outputs,
      secrets: this.layers.secrets,
      env: this.sanitizeEnv(),
      global: this.layers.global,
      workflow: this.layers.workflow,
      inputs: this.layers.inputs,
      outputs: this.layers.outputs,
      nodes: this.layers.nodes,
    };
  }

  sanitizeEnv() {
    const out = {};
    for (const [k, v] of Object.entries(this.layers.env || {})) {
      if (/secret|password|token|key|api_/i.test(k)) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
    return out;
  }

  get(path) {
    if (!path) return this.flat();
    const flat = this.flat();
    return getByPath(flat, path);
  }

  set(path, value, layer = "workflow") {
    if (!this.layers[layer]) this.layers[layer] = {};
    if (path.includes(".") || path.includes("[")) {
      setByPath(this.layers[layer], path, value);
    } else {
      this.layers[layer][path] = value;
    }
    return value;
  }

  setNodeOutput(nodeKey, outputs) {
    this.layers.nodes[nodeKey] = {
      ...(this.layers.nodes[nodeKey] || {}),
      outputs,
      ...outputs,
    };
    if (outputs && typeof outputs === "object") {
      Object.assign(this.layers.outputs, outputs);
    }
  }

  mergeInputs(inputs) {
    Object.assign(this.layers.inputs, inputs || {});
  }

  resolve(value) {
    return resolveValue(value, this.flat());
  }

  interpolate(template) {
    return interpolate(template, this.flat());
  }

  toPersistence() {
    return {
      workflow: this.layers.workflow,
      inputs: this.layers.inputs,
      outputs: this.layers.outputs,
      nodes: this.layers.nodes,
      global: this.layers.global,
      // secrets never persisted in plain form to execution variables dump beyond masked
      secrets: Object.fromEntries(
        Object.keys(this.layers.secrets || {}).map((k) => [k, "***"]),
      ),
    };
  }
}

module.exports = { VariableStore };
