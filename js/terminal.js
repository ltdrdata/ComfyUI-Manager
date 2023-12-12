import {app} from "../../scripts/app.js";
import {ComfyWidgets} from "../../scripts/widgets.js";
// Node that add notes to your project

let terminal_node;

app.registerExtension({
	name: "Comfy.Manager.Terminal",

	registerCustomNodes() {
		class TerminalNode {
			color = "#222222";
			bgcolor = "#000000";
			groupcolor = LGraphCanvas.node_colors.black.groupcolor;
			constructor() {
				if(terminal_node) {
					try {
						terminal_node.widgets[0].value = 'The output of this node is disabled because another terminal node has appeared.';
						node.widgets[1].value = terminal_node.widgets[1].value;
					}
					catch {}
				}

				terminal_node = this;
				this.logs = [];

				if (!this.properties) {
					this.properties = {};
					this.properties.text="";
				}

				ComfyWidgets.STRING(this, "", ["", {default:this.properties.text, multiline: true}], app)
				ComfyWidgets.BOOLEAN(this, "mode", ["", {default:true, label_on:'Logging', label_off:'Stop'}], app)
				ComfyWidgets.INT(this, "lines", ["", {default:500, min:10, max:10000, steps:1}], app)

				Object.defineProperty(this.widgets[1], 'value', {
					set: (v) => {
						api.fetchApi(`/manager/terminal?mode=${v}`, {});
						this._value = v;
					},
					get: () => {
						return this._value;
					}
				});

				this.serialize_widgets = false;
				this.isVirtualNode = true;
			}
		}

		// Load default visibility
		LiteGraph.registerNodeType(
			"Terminal Log //CM",
			Object.assign(TerminalNode, {
				title_mode: LiteGraph.NORMAL_TITLE,
				title: "Terminal Log (Manager)",
				collapsable: true,
			})
		);

		TerminalNode.category = "utils";
	},
});


import { api } from "../../scripts/api.js";

function terminalFeedback(event) {
	if(terminal_node) {
		terminal_node.logs.push(event.detail.data);
		if(terminal_node.logs.length > terminal_node.widgets[2].value) {
			terminal_node.logs.shift();
			if(terminal_node.logs[0] == '' || terminal_node.logs[0] == '\n')
				terminal_node.logs.shift();
		}
		terminal_node.widgets[0].value = [...terminal_node.logs].reverse().join('').trim();
	}
}

api.addEventListener("manager-terminal-feedback", terminalFeedback);
