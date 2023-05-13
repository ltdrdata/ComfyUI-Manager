import { app } from "/scripts/app.js";
import { ComfyDialog, $el } from "/scripts/ui.js";
import {ComfyWidgets} from "../../scripts/widgets.js";

async function getCustomNodes() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await fetch(`/customnode/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function getAlterList() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await fetch(`/alternatives/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function getModelList() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await fetch(`/externalmodel/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function install_custom_node(target, caller, mode) {
	if(caller) {
		caller.startInstall(target);

		try {
			const response = await fetch(`/customnode/${mode}`, {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify(target)
												});

			if(response.status == 400) {
				app.ui.dialog.show(`${mode} failed: ${target.title}`);
				app.ui.dialog.element.style.zIndex = 9999;
				return false;
			}									

			const status = await response.json();
			app.ui.dialog.close();
			target.installed = 'True';
			return true;
		}
		catch(exception) {
			app.ui.dialog.show(`${mode} failed: ${target.title} / ${exception}`);
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}
		finally {
			await caller.invalidateControl();
			caller.updateMessage('<BR>To apply the installed custom node, please restart ComfyUI.');
		}
	}
}

async function install_model(target) {
	if(ModelInstaller.instance) {
		ModelInstaller.instance.startInstall(target);

		try {
			const response = await fetch('/model/install', {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify(target)
												});

			const status = await response.json();
			app.ui.dialog.close();
			target.installed = 'True';
			return true;
		}
		catch(exception) {
			app.ui.dialog.show(`Install failed: ${target.title} / ${exception}`);
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}
		finally {
			await ModelInstaller.instance.invalidateControl();
			ModelInstaller.instance.updateMessage("<BR>To apply the installed model, please click the 'Refresh' button on the main menu.");
		}
	}
}


// -----
class CustomNodesInstaller extends ComfyDialog {
	static instance = null;

	install_buttons = [];
	message_box = null;
	data = null;

	clear() {
		this.install_buttons = [];
		this.message_box = null;
		this.data = null;
	}

	constructor() {
		super();
		this.element = $el("div.comfy-modal", { parent: document.body }, []);
	}

	startInstall(target) {
		const self = CustomNodesInstaller.instance;
		
		self.updateMessage(`<BR><font color="green">Installing '${target.title}'</font>`);

		for(let i in self.install_buttons) {
			self.install_buttons[i].disabled = true;
			self.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	async invalidateControl() {
		this.clear();

		// splash
		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		const msg = $el('div', {id:'custom-message'}, 
			[$el('br'), 
			'The custom node DB is currently being updated, and updates to custom nodes are being checked for.', 
			$el('br')]);
		msg.style.height = '100px';
		msg.style.verticalAlign = 'middle';
		this.element.appendChild(msg);

		// invalidate
		this.data = (await getCustomNodes()).custom_nodes;

		this.element.removeChild(msg);

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		await this.createGrid();
		this.createControls();
	}

	updateMessage(msg) {
		this.message_box.innerHTML = msg;
	}

	async createGrid() {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'custom-nodes-grid');

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%"

		var headerRow = document.createElement('tr');
		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Author';
		header2.style.width = "150px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Name';
		header3.style.width = "200px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Description';
		header4.style.width = "500px";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Install';
		header5.style.width = "130px";
		headerRow.appendChild(header1);
		headerRow.appendChild(header2);
		headerRow.appendChild(header3);
		headerRow.appendChild(header4);
		headerRow.appendChild(header5);

		headerRow.style.backgroundColor = "Black";
		headerRow.style.color = "White";
		headerRow.style.textAlign = "center";
		headerRow.style.width = "100%";
		headerRow.style.padding = "0";
		grid.appendChild(headerRow);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');
				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
				data2.innerHTML = `&nbsp;${data.author}`;
				var data3 = document.createElement('td');
				data3.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.title}</b></font></a>`;
				var data4 = document.createElement('td');
				data4.innerHTML = data.description;
				var data5 = document.createElement('td');
				data5.style.textAlign = "center";

				var installBtn = document.createElement('button');
				var installBtn2 = null;

				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'Update':
					installBtn2 = document.createElement('button');
					installBtn2.innerHTML = 'Update';
					installBtn2.style.backgroundColor = 'blue';
					this.install_buttons.push(installBtn2);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'True':
					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'False':
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					break;
				default:
					installBtn.innerHTML = 'Try Install';
					installBtn.style.backgroundColor = 'silver';
				}

				if(installBtn2 != null) {
					installBtn2.addEventListener('click', function() {
						install_custom_node(data, CustomNodesInstaller.instance, 'update');
					});

					data5.appendChild(installBtn2);
				}

				installBtn.addEventListener('click', function() {
					if(this.innerHTML == 'Uninstall') {
						if (confirm(`Are you sure uninstall ${data.title}?`)) {
							install_custom_node(data, CustomNodesInstaller.instance, 'uninstall');
						}
					}
					else {
						install_custom_node(data, CustomNodesInstaller.instance, 'install');
					}
				});

				data5.appendChild(installBtn);

				dataRow.style.backgroundColor = "#444444";
				dataRow.style.color = "White";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				grid.appendChild(dataRow);
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1000px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	async createControls() {
		var close_button = document.createElement("button");
		close_button.innerHTML = "Close";
		close_button.onclick = () => { this.close(); }
		close_button.style.display = "inline-block";

		this.message_box = $el('div', {id:'custom-installer-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show() {
		try {
			this.invalidateControl();

			this.element.style.display = "block";
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get custom node list. / ${exception}`);
		}
	}
}

// -----
class AlternativesInstaller extends ComfyDialog {
	static instance = null;

	install_buttons = [];
	message_box = null;
	data = null;

	clear() {
		this.install_buttons = [];
		this.message_box = null;
		this.data = null;
	}

	constructor() {
		super();
		this.element = $el("div.comfy-modal", { parent: document.body }, []);
	}

	startInstall(target) {
		const self = AlternativesInstaller.instance;

		self.updateMessage(`<BR><font color="green">Installing '${target.title}'</font>`);

		for(let i in self.install_buttons) {
			self.install_buttons[i].disabled = true;
			self.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	async invalidateControl() {
		this.clear();

		// splash
		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		const msg = $el('div', {id:'custom-message'}, 
			[$el('br'), 
			'The custom node DB is currently being updated, and updates to custom nodes are being checked for.', 
			$el('br')]);
		msg.style.height = '100px';
		msg.style.verticalAlign = 'middle';
		this.element.appendChild(msg);

		// invalidate
		this.data = (await getAlterList()).items;

		this.element.removeChild(msg);

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		await this.createGrid();
		this.createControls();
	}

	updateMessage(msg) {
		this.message_box.innerHTML = msg;
	}

	async createGrid() {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'alternatives-grid');

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%"

		var headerRow = document.createElement('tr');
		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Tags';
		header2.style.width = "200px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Author';
		header3.style.width = "150px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Title';
		header4.style.width = "200px";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Description';
		header5.style.width = "500px";
		var header6 = document.createElement('th');
		header6.innerHTML = 'Install';
		header6.style.width = "130px";
		headerRow.appendChild(header1);
		headerRow.appendChild(header2);
		headerRow.appendChild(header3);
		headerRow.appendChild(header4);
		headerRow.appendChild(header5);
		headerRow.appendChild(header6);

		headerRow.style.backgroundColor = "Black";
		headerRow.style.color = "White";
		headerRow.style.textAlign = "center";
		headerRow.style.width = "100%";
		headerRow.style.padding = "0";
		grid.appendChild(headerRow);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');
				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
				data2.innerHTML = `&nbsp;${data.tags}`;
				var data3 = document.createElement('td');
				var data4 = document.createElement('td');
				if(data.custom_node) {
					data3.innerHTML = `&nbsp;${data.custom_node.author}`;
					data4.innerHTML = `&nbsp;<a href=${data.custom_node.reference} target="_blank"><font color="skyblue"><b>${data.custom_node.title}</b></font></a>`;
				}
				else {
					data3.innerHTML = `&nbsp;Unknown`;
					data4.innerHTML = `&nbsp;Unknown`;
				}
				var data5 = document.createElement('td');
				data5.innerHTML = data.description;
				var data6 = document.createElement('td');
				data6.style.textAlign = "center";

				if(data.custom_node) {
					var installBtn = document.createElement('button');
					var installBtn2 = null;

					this.install_buttons.push(installBtn);

					switch(data.custom_node.installed) {
					case 'Update':
						installBtn2 = document.createElement('button');
						installBtn2.innerHTML = 'Update';
						installBtn2.style.backgroundColor = 'blue';
						this.install_buttons.push(installBtn2);
	
						installBtn.innerHTML = 'Uninstall';
						installBtn.style.backgroundColor = 'red';
						break;
					case 'True':
						installBtn.innerHTML = 'Uninstall';
						installBtn.style.backgroundColor = 'red';
						break;
					case 'False':
						installBtn.innerHTML = 'Install';
						installBtn.style.backgroundColor = 'black';
						break;
					default:
						installBtn.innerHTML = 'Try Install';
						installBtn.style.backgroundColor = 'silver';
					}

					if(installBtn2 != null) {
						installBtn2.addEventListener('click', function() {
							install_custom_node(data.custom_node, AlternativesInstaller.instance, 'update');
						});
	
						data6.appendChild(installBtn2);
					}

					installBtn.addEventListener('click', function() {
						if(this.innerHTML == 'Uninstall') {
							if (confirm(`Are you sure uninstall ${data.title}?`)) {
								install_custom_node(data.custom_node, AlternativesInstaller.instance, 'uninstall');
							}
						}
						else {
							install_custom_node(data.custom_node, AlternativesInstaller.instance, 'install');
						}
					});

					data6.appendChild(installBtn);
				}

				dataRow.style.backgroundColor = "#444444";
				dataRow.style.color = "White";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				grid.appendChild(dataRow);
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1000px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	async createControls() {
		var close_button = document.createElement("button");
		close_button.innerHTML = "Close";
		close_button.onclick = () => { this.close(); }
		close_button.style.display = "inline-block";

		this.message_box = $el('div', {id:'alternatives-installer-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show() {
		try {
			this.invalidateControl();
			this.element.style.display = "block";
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get alternatives list. / ${exception}`);
			console.error(exception);
		}
	}
}


// -----------
class ModelInstaller extends ComfyDialog {
	static instance = null;

	install_buttons = [];
	message_box = null;
	data = null;

	clear() {
		this.install_buttons = [];
		this.message_box = null;
		this.data = null;
	}

	constructor() {
		super();
		this.element = $el("div.comfy-modal", { parent: document.body }, []);
	}

	createControls() {
		return [
			$el("button", {
				type: "button",
				textContent: "Close",
				onclick: () => { this.close(); }
				})
		];
	}

	startInstall(target) {
		const self = ModelInstaller.instance;

		self.updateMessage(`<BR><font color="green">Installing '${target.name}'</font>`);

		for(let i in self.install_buttons) {
			self.install_buttons[i].disabled = true;
			self.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	async invalidateControl() {
		this.clear();
		this.data = (await getModelList()).models;

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		await this.createGrid();
		this.createControls();
	}

	updateMessage(msg) {
		this.message_box.innerHTML = msg;
	}

	async createGrid(models_json) {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'external-models-grid');

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%"

		var headerRow = document.createElement('tr');
		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Type';
		header2.style.width = "100px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Base';
		header3.style.width = "50px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Name';
		header4.style.width = "200px";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Filename';
		header5.style.width = "250px";
		header5.style.tableLayout = "fixed";
		var header6 = document.createElement('th');
		header6.innerHTML = 'description';
		header6.style.width = "380px";
		var header_down = document.createElement('th');
		header_down.innerHTML = 'Download';
		header_down.style.width = "50px";

		headerRow.appendChild(header1);
		headerRow.appendChild(header2);
		headerRow.appendChild(header3);
		headerRow.appendChild(header4);
		headerRow.appendChild(header5);
		headerRow.appendChild(header6);
		headerRow.appendChild(header_down);

		headerRow.style.backgroundColor = "Black";
		headerRow.style.color = "White";
		headerRow.style.textAlign = "center";
		headerRow.style.width = "100%";
		headerRow.style.padding = "0";
		grid.appendChild(headerRow);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');
				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
				data2.innerHTML = `&nbsp;${data.type}`;
				var data3 = document.createElement('td');
				data3.innerHTML = `&nbsp;${data.base}`;
				var data4 = document.createElement('td');
				data4.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.name}</b></font></a>`;
				var data5 = document.createElement('td');
				data5.innerHTML = `&nbsp;${data.filename}`;
				data5.style.wordBreak = "break-all";
				var data6 = document.createElement('td');
				data6.innerHTML = data.description;
				data6.style.wordBreak = "break-all";
				var data_install = document.createElement('td');
				var installBtn = document.createElement('button');
				data_install.style.textAlign = "center";

				installBtn.innerHTML = 'Install';
				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'True':
					installBtn.innerHTML = 'Installed';
					installBtn.style.backgroundColor = 'green';
					installBtn.disabled = true;
					break;
				default:
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					break;
				}

				installBtn.addEventListener('click', function() {
					install_model(data);
				});

				data_install.appendChild(installBtn);

				dataRow.style.backgroundColor = "#444444";
				dataRow.style.color = "White";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				dataRow.appendChild(data_install);
				grid.appendChild(dataRow);
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1050px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	async createControls() {
		var close_button = document.createElement("button");
		close_button.innerHTML = "Close";
		close_button.onclick = () => { this.close(); }
		close_button.style.display = "inline-block";

		this.message_box = $el('div', {id:'custom-download-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show() {
		try {
			this.invalidateControl();
			this.element.style.display = "block";
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get external model list. / ${exception}`);
		}
	}
}


// -----------
class ManagerMenuDialog extends ComfyDialog {
	static instance = null;
	local_mode_checkbox = null;

	createButtons() {
		this.local_mode_checkbox = $el("input",{type:'checkbox', id:"use_local_db"},[])
		const checkbox_text = $el("label",{},["Use local DB"])
		checkbox_text.style.color = "var(--fg-color)"

		const res =
			[
				$el("tr.td", {width:"100%"}, [$el("font", {size:6, color:"white"}, [`Manager Menu`])]),
				$el("br", {}, []),
				$el("div", {}, [this.local_mode_checkbox, checkbox_text]),
				$el("br", {}, []),
				$el("button", {
					type: "button",
					textContent: "Install Custom Nodes",
					onclick:
						() => {
							if(!CustomNodesInstaller.instance)
								CustomNodesInstaller.instance = new CustomNodesInstaller(app);
							CustomNodesInstaller.instance.show();
						}
				}),

				$el("button", {
					type: "button",
					textContent: "Install Models",
					onclick:
						() => {
							if(!ModelInstaller.instance)
								ModelInstaller.instance = new ModelInstaller(app);
							ModelInstaller.instance.show();
						}
				}),

				$el("br", {}, []),
				$el("button", {
					type: "button",
					textContent: "Alternatives of A1111",
					onclick:
						() => {
							if(!AlternativesInstaller.instance)
								AlternativesInstaller.instance = new AlternativesInstaller(app);
							AlternativesInstaller.instance.show();
						}
				}),

				$el("br", {}, []),
				$el("button", {
					type: "button",
					textContent: "Close",
					onclick: () => this.close(),
				}),
				$el("br", {}, []),
			];

		res[0].style.backgroundColor = "black";
		res[0].style.textAlign = "center";
		res[0].style.height = "45px";
		return res;
	}

	constructor() {
		super();
		this.element = $el("div.comfy-modal", { parent: document.body },
			[ $el("div.comfy-modal-content",
				[...this.createButtons()]),
			]);
	}

	show() {
		this.element.style.display = "block";
	}
}

app.registerExtension({
	name: "Comfy.ManagerMenu",

	async setup() {
		const menu = document.querySelector(".comfy-menu");
		const separator = document.createElement("hr");

		separator.style.margin = "20px 0";
		separator.style.width = "100%";
		menu.append(separator);

		const managerButton = document.createElement("button");
		managerButton.textContent = "Manager";
		managerButton.onclick = () => {
				if(!ManagerMenuDialog.instance)
					ManagerMenuDialog.instance = new ManagerMenuDialog();
				ManagerMenuDialog.instance.show();
			}
		menu.append(managerButton);
	}
});
