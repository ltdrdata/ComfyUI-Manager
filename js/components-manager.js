import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { sleep } from "./common.js";
import { GroupNodeConfig, GroupNodeHandler } from "../../extensions/core/groupNode.js";

function storeGroupNode(name, data) {
	let extra = app.graph.extra;
	if (!extra) app.graph.extra = extra = {};
	let groupNodes = extra.groupNodes;
	if (!groupNodes) extra.groupNodes = groupNodes = {};
	groupNodes[name] = data;
}

export async function load_components() {
	let data = await api.fetchApi('/manager/component/loads', {method: "POST"});
	let components = await data.json();

//	while(!app.graph) {
//		await sleep(100);
//	}

	let start_time = Date.now();
	let failed = [];
	let failed2 = [];

	for(let name in components) {
		if(app.graph.extra?.groupNodes?.[name]) {
			continue;
		}

		let nodeData = components[name];

		storeGroupNode(name, nodeData);

		const config = new GroupNodeConfig(name, nodeData);
		while(!success) {
			var success = false;
			try {
				await config.registerType();
			}
			catch {
				let elapsed_time = Date.now() - start_time;
				if (elapsed_time > 5000) {
					failed.push(name);
					success = true;
				} else {
					await sleep(100);
				}
			}
		}

		const groupNode = LiteGraph.createNode(`workflow/${name}`);
	}

	// fallback1
	for(let i in failed) {
		let name = failed[i];

		if(app.graph.extra?.groupNodes?.[name]) {
			continue;
		}

		let nodeData = components[name];

		storeGroupNode(name, nodeData);

		const config = new GroupNodeConfig(name, nodeData);
		while(!success) {
			var success = false;
			try {
				await config.registerType();
			}
			catch {
				let elapsed_time = Date.now() - start_time;
				if (elapsed_time > 10000) {
					failed2.push(name);
					success = true;
				} else {
					await sleep(100);
				}
			}
		}

		const groupNode = LiteGraph.createNode(`workflow/${name}`);
	}

	// fallback2
	for(let name in failed2) {
		let name = failed2[i];

		let nodeData = components[name];

		storeGroupNode(name, nodeData);

		const config = new GroupNodeConfig(name, nodeData);
		while(!success) {
			var success = false;
			try {
				await config.registerType();
			}
			catch {
				let elapsed_time = Date.now() - start_time;
				if (elapsed_time > 30000) {
					failed.push(name);
					success = true;
				} else {
					await sleep(100);
				}
			}
		}

		const groupNode = LiteGraph.createNode(`workflow/${name}`);
	}
}

export async function save_as_component(node, app) {
	let pure_name = node.comfyClass.substring(9);
	let subgraph = app.graph.extra?.groupNodes?.[pure_name];

	if(!subgraph) {
		app.ui.dialog.show(`Failed to retrieve the group node '${pure_name}'.`);
		return;
	}

	if(node.comfyClass.includes('::')) {
		let component_name = node.comfyClass.substring(9);

		if(confirm(`Will you save/overwrite component '${component_name}'?`)) {
			let subgraph = app.graph.extra?.groupNodes?.[component_name];
				let body =
					{
						name: component_name,
						workflow: subgraph
					};

			const res = await api.fetchApi('/manager/component/save', {
				method: "POST",
				headers: { "Content-Type": "application/json", },
				body: JSON.stringify(body)
				});

			if(res.status == 200) {
				storeGroupNode(name, subgraph);
				const config = new GroupNodeConfig(name, subgraph);
				await config.registerType();

				let path = await res.text();
				app.ui.dialog.show(`Component '${component_name}' is saved into:\n${path}`);
			}
			else
				app.ui.dialog.show(`Failed to save component.`);
		}

		return;
	}

	var prefix = prompt("To save as a component, a unique prefix is required. (e.g., the 'Impact' in Impact::MAKE_BASIC_PIPE)", "PREFIX");

	if(!prefix) {
		return;
	}

	prefix = prefix.trim();

	if(prefix == 'PREFIX') {
		app.ui.dialog.show(`The placeholder 'PREFIX' isn't allowed for component prefix.`);
		return;
	}

	let component_name = prefix+'::'+pure_name;
	let body =
		{
			name: component_name,
			workflow: subgraph
		};

	const res = await api.fetchApi('/manager/component/save', {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

	if(res.status == 200) {
		let path = await res.text();
		app.ui.dialog.show(`Component '${component_name}' is saved into:\n${path}`);
	}
	else
		app.ui.dialog.show(`Failed to save component.`);
}