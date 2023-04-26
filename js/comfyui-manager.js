import { app } from "/scripts/app.js";
import { ComfyDialog, $el } from "/scripts/ui.js";
import {ComfyWidgets} from "../../scripts/widgets.js";

async function getCustomNodes() {
	const response = await fetch('/customnode/getlist', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({})
										});

	const data = await response.json();
	return data;
}

async function getModelList() {
	const response = await fetch('/externalmodel/getlist', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({})
										});

	const data = await response.json();
	return data;
}

async function install_custom_node(target) {
	if(CustomNodesInstaller.instance) {
		CustomNodesInstaller.instance.startInstall(target);

		try {
			const response = await fetch('/customnode/install', {
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
			CustomNodesInstaller.instance.stopInstall();
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
			ModelInstaller.instance.stopInstall();
		}
	}
}


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
		console.log(target);
		this.message_box.innerHTML = `<BR><font color="green">Installing '${target.title}'</font>`;

		for(let i in this.install_buttons) {
			this.install_buttons[i].disabled = true;
			this.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	stopInstall() {
		this.message_box.innerHTML = '<BR>To apply the installed custom node, please restart ComfyUI.';

		for(let i in this.install_buttons) {
			switch(this.data[i].installed)
			{
			case 'True':
				this.install_buttons[i].innerHTML = 'Installed';
				this.install_buttons[i].style.backgroundColor = 'green';
				this.install_buttons[i].disabled = true;
				break;
			case 'False':
				this.install_buttons[i].innerHTML = 'Install';
				this.install_buttons[i].style.backgroundColor = 'black';
				this.install_buttons[i].disabled = false;
				break;
			default:
				this.install_buttons[i].innerHTML = 'Try Install';
				this.install_buttons[i].style.backgroundColor = 'brown';
				this.install_buttons[i].disabled = false;
				break;
			}
		}
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

				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'True':
					installBtn.innerHTML = 'Installed';
					installBtn.style.backgroundColor = 'green';
					installBtn.disabled = true;
					break;
				case 'False':
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					break;
				default:
					installBtn.innerHTML = 'Try Install';
					installBtn.style.backgroundColor = 'brown';
				}

				installBtn.addEventListener('click', function() {
					install_custom_node(data);
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
			this.clear();
			this.data = (await getCustomNodes()).custom_nodes;

			while (this.element.children.length) {
				this.element.removeChild(this.element.children[0]);
			}

			await this.createGrid();
			this.createControls();
			this.element.style.display = "block";
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get custom node list. / ${exception}`);
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
		this.message_box.innerHTML = `<BR><font color="green">Installing '${target.name}'</font>`;

		for(let i in this.install_buttons) {
			this.install_buttons[i].disabled = true;
			this.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	stopInstall() {
		this.message_box.innerHTML = "<BR>To apply the installed model, please click the 'Refresh' button on the main menu.";

		for(let i in this.install_buttons) {
			switch(this.data[i].installed)
			{
			case 'True':
				this.install_buttons[i].innerHTML = 'Installed';
				this.install_buttons[i].style.backgroundColor = 'green';
				this.install_buttons[i].disabled = true;
				break;
			default:
				this.install_buttons[i].innerHTML = 'Install';
				this.install_buttons[i].style.backgroundColor = 'black';
				this.install_buttons[i].disabled = false;
				break;
			}
		}
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
			this.clear();
			this.data = (await getModelList()).models;

			while (this.element.children.length) {
				this.element.removeChild(this.element.children[0]);
			}

			await this.createGrid();
			this.createControls();
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

	createButtons() {
		const res =
			[
				$el("tr.td", {width:"100%"}, [$el("font", {size:6, color:"white"}, ["Manager Menu"])]),
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

				$el("button", {
					type: "button",
					textContent: "Close",
					onclick: () => this.close(),
				})
			];

		console.log(res);
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
