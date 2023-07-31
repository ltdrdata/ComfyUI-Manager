import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";
import {ComfyWidgets} from "../../scripts/widgets.js";

var update_comfyui_button = null;
var fetch_updates_button = null;

async function getCustomnodeMappings() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await api.fetchApi(`/customnode/getmappings?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function getUnresolvedNodesInComponent() {
	try {
		var mode = "url";
		if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
			mode = "local";

		const response = await api.fetchApi(`/component/get_unresolved`);

		const data = await response.json();
		return data.nodes;
	}
	catch {
		return [];
	}
}

async function getCustomNodes() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await api.fetchApi(`/customnode/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function getAlterList() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await api.fetchApi(`/alternatives/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function getModelList() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	const response = await api.fetchApi(`/externalmodel/getlist?mode=${mode}`);

	const data = await response.json();
	return data;
}

async function install_custom_node(target, caller, mode) {
	if(caller) {
		caller.startInstall(target);

		try {
			const response = await api.fetchApi(`/customnode/${mode}`, {
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
			caller.updateMessage('<BR>To apply the installed/disabled/enabled custom node, please restart ComfyUI.');
		}
	}
}

async function updateComfyUI() {
	update_comfyui_button.innerText = "Updating ComfyUI...";
	update_comfyui_button.disabled = true;

	try {
		const response = await api.fetchApi('/comfyui_manager/update_comfyui');

		if(response.status == 400) {
			app.ui.dialog.show('Failed to update ComfyUI');
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}

		if(response.status == 201) {
			app.ui.dialog.show('ComfyUI has been successfully updated.');
			app.ui.dialog.element.style.zIndex = 9999;
		}
		else {
			app.ui.dialog.show('ComfyUI is already up to date with the latest version.');
			app.ui.dialog.element.style.zIndex = 9999;
		}

		return true;
	}
	catch(exception) {
		app.ui.dialog.show(`Failed to update ComfyUI / ${exception}`);
		app.ui.dialog.element.style.zIndex = 9999;
		return false;
	}
	finally {
		update_comfyui_button.disabled = false;
		update_comfyui_button.innerText = "Update ComfyUI";
	}
}

async function fetchUpdates() {
	fetch_updates_button.innerText = "Fetching updates...";
	fetch_updates_button.disabled = true;

	try {
		var mode = "url";
        if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
            mode = "local";

		const response = await api.fetchApi(`/customnode/fetch_updates?mode=${mode}`);

		if(response.status == 400) {
			app.ui.dialog.show('Failed to fetch updates.');
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}

		if(response.status == 201) {
			app.ui.dialog.show('There is an updated extension available.');
			app.ui.dialog.element.style.zIndex = 9999;
		}
		else {
			app.ui.dialog.show('All extensions are already up-to-date with the latest versions.');
			app.ui.dialog.element.style.zIndex = 9999;
		}

		return true;
	}
	catch(exception) {
		app.ui.dialog.show(`Failed to update ComfyUI / ${exception}`);
		app.ui.dialog.element.style.zIndex = 9999;
		return false;
	}
	finally {
		fetch_updates_button.disabled = false;
		fetch_updates_button.innerText = "Fetch Updates";
	}
}

async function install_model(target) {
	if(ModelInstaller.instance) {
		ModelInstaller.instance.startInstall(target);

		try {
			const response = await api.fetchApi('/model/install', {
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
		this.search_keyword = '';
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

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data = this.grid_rows[i].data;
			let content = data.author.toLowerCase() + data.description.toLowerCase() + data.title.toLowerCase();

			if(this.filter && this.filter != '*') {
				if(this.filter != data.installed) {
					this.grid_rows[i].control.style.display = 'none';
					continue;
				}
			}

			if(keyword == "")
				this.grid_rows[i].control.style.display = null;
			else if(content.includes(keyword)) {
				this.grid_rows[i].control.style.display = null;
			}
			else {
				this.grid_rows[i].control.style.display = 'none';
			}
		}
	}

	async filter_missing_node(data) {
		const mappings = await getCustomnodeMappings();


		// build regex->url map
		const regex_to_url = [];
		for (let i in data) {
			if(data[i]['nodename_pattern']) {
				let item = {regex: new RegExp(data[i].nodename_pattern), url: data[i].files[0]};
				regex_to_url.push(item);
			}
		}

		// build name->url map
		const name_to_url = {};
		for (const url in mappings) {
			const names = mappings[url];
			for(const name in names) {
				name_to_url[names[name]] = url;
			}
		}

		const registered_nodes = new Set();
		for (let i in LiteGraph.registered_node_types) {
			registered_nodes.add(LiteGraph.registered_node_types[i].type);
		}

		const missing_nodes = new Set();
		const nodes = app.graph.serialize().nodes;
		for (let i in nodes) {
			const node_type = nodes[i].type;
			if (!registered_nodes.has(node_type)) {
				const url = name_to_url[node_type];
				if(url)
					missing_nodes.add(url);
				else {
					for(let j in regex_to_url) {
						if(regex_to_url[j].regex.test(node_type)) {
							missing_nodes.add(regex_to_url[j].url);
						}
					}
				}
			}
		}

		let unresolved_nodes = await getUnresolvedNodesInComponent();
		for (let i in unresolved_nodes) {
			let node_type = unresolved_nodes[i];
			const url = name_to_url[node_type];
			if(url)
				missing_nodes.add(url);
		}

		return data.filter(node => node.files.some(file => missing_nodes.has(file)));
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
			$el('br'),
			'NOTE: Update only checks for extensions that have been fetched.',
			$el('br')]);
		msg.style.height = '100px';
		msg.style.verticalAlign = 'middle';
		this.element.appendChild(msg);

		// invalidate
		this.data = (await getCustomNodes()).custom_nodes;

		if(this.is_missing_node_mode)
			this.data = await this.filter_missing_node(this.data);

		this.element.removeChild(msg);

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		this.createHeaderControls();
		await this.createGrid();
		this.apply_searchbox(this.data);
		this.createBottomControls();
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

		this.grid_rows = {};

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');
				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
		        data2.style.maxWidth = "100px";
				data2.textContent = ` ${data.author}`;
				data2.style.whiteSpace = "nowrap";
                data2.style.overflow = "hidden";
				data2.style.textOverflow = "ellipsis";
                var data3 = document.createElement('td');
                data3.style.maxWidth = "200px";
                data3.style.wordWrap = "break-word";
                data3.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.title}</b></font></a>`;
				var data4 = document.createElement('td');
				data4.innerHTML = data.description;
				var data5 = document.createElement('td');
				data5.style.textAlign = "center";

				var installBtn = document.createElement('button');
				var installBtn2 = null;
				var installBtn3 = null;

				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'Disabled':
					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Enable';
					installBtn3.style.backgroundColor = 'blue';
					installBtn3.style.color = 'white';
					this.install_buttons.push(installBtn3);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'Update':
					installBtn2 = document.createElement('button');
					installBtn2.innerHTML = 'Update';
					installBtn2.style.backgroundColor = 'blue';
					installBtn2.style.color = 'white';
					this.install_buttons.push(installBtn2);

					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Disable';
					installBtn3.style.backgroundColor = 'MediumSlateBlue';
					installBtn3.style.color = 'white';
					this.install_buttons.push(installBtn3);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'True':
					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Disable';
					installBtn3.style.backgroundColor = 'MediumSlateBlue';
					installBtn3.style.color = 'white';
					this.install_buttons.push(installBtn3);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'False':
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					installBtn.style.color = 'white';
					break;
				default:
					installBtn.innerHTML = 'Try Install';
					installBtn.style.backgroundColor = 'Gray';
					installBtn.style.color = 'white';
				}

				if(installBtn2 != null) {
					installBtn2.style.width = "120px";
					installBtn2.addEventListener('click', function() {
						install_custom_node(data, CustomNodesInstaller.instance, 'update');
					});

					data5.appendChild(installBtn2);
				}

				if(installBtn3 != null) {
					installBtn3.style.width = "120px";
					installBtn3.addEventListener('click', function() {
						install_custom_node(data, CustomNodesInstaller.instance, 'toggle_active');
					});

					data5.appendChild(installBtn3);
				}

				installBtn.style.width = "120px";
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

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				grid.appendChild(dataRow);

				this.grid_rows[i] = {data:data, control:dataRow};
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1000px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	createFilterCombo() {
		let combo = document.createElement("select");

		combo.style.cssFloat = "left";
		combo.style.fontSize = "14px";
		combo.style.padding = "4px";
		combo.style.background = "black";
		combo.style.marginLeft = "2px";
		combo.style.width = "199px";
		combo.id = `combo-manger-filter`;
		combo.style.borderRadius = "15px";

		let items =
			[
				{ value:'*', text:'Filter: all' },
				{ value:'Disabled', text:'Filter: disabled' },
				{ value:'Update', text:'Filter: update' },
				{ value:'True', text:'Filter: installed' },
				{ value:'False', text:'Filter: not-installed' },
			];

		items.forEach(item => {
			const option = document.createElement("option");
			option.value = item.value;
			option.text = item.text;
			combo.appendChild(option);
		});

		let self = this;
		combo.addEventListener('change', function(event) {
			self.filter = event.target.value;
			self.apply_searchbox();
		});

		return combo;
	}

	createHeaderControls() {
		let self = this;
		this.search_box = $el('input', {type:'text', id:'manager-customnode-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
		this.search_box.style.height = "25px";
		this.search_box.onkeydown = (event) => {
				if (event.key === 'Enter') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
				if (event.key === 'Escape') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
			};


		let search_button = document.createElement("button");
		search_button.innerHTML = "Search";
		search_button.onclick = () => {
			self.search_keyword = self.search_box.value;
			self.apply_searchbox();
		};
		search_button.style.display = "inline-block";

		let filter_control = this.createFilterCombo();
		filter_control.style.display = "inline-block";

		let cell = $el('td', {width:'100%'}, [filter_control, this.search_box, '  ', search_button]);
		let search_control = $el('table', {width:'100%'},
				[
					$el('tr', {}, [cell])
				]
			);

		cell.style.textAlign = "right";

		this.element.appendChild(search_control);
	}

	async createBottomControls() {
		let close_button = document.createElement("button");
		close_button.innerHTML = "Close";
		close_button.onclick = () => { this.close(); }
		close_button.style.display = "inline-block";

		this.message_box = $el('div', {id:'custom-installer-message'}, [$el('br'), '']);
		this.message_box.style.height = '60px';
		this.message_box.style.verticalAlign = 'middle';

		this.element.appendChild(this.message_box);
		this.element.appendChild(close_button);
	}

	async show(is_missing_node_mode) {
		this.is_missing_node_mode = is_missing_node_mode;
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
		this.search_keyword = '';
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

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data1 = this.grid_rows[i].data;
			let data2 = data1.custom_node;
			let content = data1.tags.toLowerCase() + data1.description.toLowerCase() + data2.author.toLowerCase() + data2.description.toLowerCase() + data2.title.toLowerCase();

			if(this.filter && this.filter != '*') {
				if(this.filter != data2.installed) {
					this.grid_rows[i].control.style.display = 'none';
					continue;
				}
			}

			if(keyword == "")
				this.grid_rows[i].control.style.display = null;
			else if(content.includes(keyword)) {
				this.grid_rows[i].control.style.display = null;
			}
			else {
				this.grid_rows[i].control.style.display = 'none';
			}
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
			$el('br'),
			'NOTE: Update only checks for extensions that have been fetched.',
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

		this.createHeaderControls();
		await this.createGrid();
		this.apply_searchbox(this.data);
		this.createBottomControls();
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

		this.grid_rows = {};

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
					var installBtn3 = null;

					this.install_buttons.push(installBtn);

					switch(data.custom_node.installed) {
					case 'Disabled':
						installBtn3 = document.createElement('button');
						installBtn3.innerHTML = 'Enable';
						installBtn3.style.backgroundColor = 'blue';
						installBtn3.style.color = 'white';
						this.install_buttons.push(installBtn3);

						installBtn.innerHTML = 'Uninstall';
						installBtn.style.backgroundColor = 'red';
						installBtn.style.color = 'white';
						break;
					case 'Update':
						installBtn2 = document.createElement('button');
						installBtn2.innerHTML = 'Update';
						installBtn2.style.backgroundColor = 'blue';
						installBtn2.style.color = 'white';
						this.install_buttons.push(installBtn2);

						installBtn3 = document.createElement('button');
						installBtn3.innerHTML = 'Disable';
						installBtn3.style.backgroundColor = 'MediumSlateBlue';
						installBtn3.style.color = 'white';
						this.install_buttons.push(installBtn3);

						installBtn.innerHTML = 'Uninstall';
						installBtn.style.backgroundColor = 'red';
						installBtn.style.color = 'white';
						break;
					case 'True':
						installBtn3 = document.createElement('button');
						installBtn3.innerHTML = 'Disable';
						installBtn3.style.backgroundColor = 'MediumSlateBlue';
						installBtn3.style.color = 'white';
						this.install_buttons.push(installBtn3);

						installBtn.innerHTML = 'Uninstall';
						installBtn.style.backgroundColor = 'red';
						installBtn.style.color = 'white';
						break;
					case 'False':
						installBtn.innerHTML = 'Install';
						installBtn.style.backgroundColor = 'black';
						installBtn.style.color = 'white';
						break;
					default:
						installBtn.innerHTML = 'Try Install';
						installBtn.style.backgroundColor = 'Gray';
						installBtn.style.color = 'white';
					}

					if(installBtn2 != null) {
						installBtn2.style.width = "120px";
						installBtn2.addEventListener('click', function() {
							install_custom_node(data.custom_node, AlternativesInstaller.instance, 'update');
						});

						data6.appendChild(installBtn2);
					}

					if(installBtn3 != null) {
						installBtn3.style.width = "120px";
						installBtn3.addEventListener('click', function() {
							install_custom_node(data, CustomNodesInstaller.instance, 'toggle_active');
						});

						data6.appendChild(installBtn3);
					}


					installBtn.style.width = "120px";
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

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				grid.appendChild(dataRow);

				this.grid_rows[i] = {data:data, control:dataRow};
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1000px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	createFilterCombo() {
		let combo = document.createElement("select");

		combo.style.cssFloat = "left";
		combo.style.fontSize = "14px";
		combo.style.padding = "4px";
		combo.style.background = "black";
		combo.style.marginLeft = "2px";
		combo.style.width = "199px";
		combo.id = `combo-manger-filter`;
		combo.style.borderRadius = "15px";

		let items =
			[
				{ value:'*', text:'Filter: all' },
				{ value:'Disabled', text:'Filter: disabled' },
				{ value:'Update', text:'Filter: update' },
				{ value:'True', text:'Filter: installed' },
				{ value:'False', text:'Filter: not-installed' },
			];

		items.forEach(item => {
			const option = document.createElement("option");
			option.value = item.value;
			option.text = item.text;
			combo.appendChild(option);
		});

		let self = this;
		combo.addEventListener('change', function(event) {
			self.filter = event.target.value;
			self.apply_searchbox();
		});

		return combo;
	}

	createHeaderControls() {
		let self = this;
		this.search_box = $el('input', {type:'text', id:'manager-alternode-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
		this.search_box.style.height = "25px";
		this.search_box.onkeydown = (event) => {
				if (event.key === 'Enter') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
				if (event.key === 'Escape') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
			};

		let search_button = document.createElement("button");
		search_button.innerHTML = "Search";
		search_button.onclick = () => {
			self.search_keyword = self.search_box.value;
			self.apply_searchbox();
		};
		search_button.style.display = "inline-block";

		let filter_control = this.createFilterCombo();
		filter_control.style.display = "inline-block";

		let cell = $el('td', {width:'100%'}, [filter_control, this.search_box, '  ', search_button]);
		let search_control = $el('table', {width:'100%'},
				[
					$el('tr', {}, [cell])
				]
			);

		cell.style.textAlign = "right";
		this.element.appendChild(search_control);
	}

	async createBottomControls() {
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
		this.search_keyword = '';
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

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data = this.grid_rows[i].data;
			let content = data.name.toLowerCase() + data.type.toLowerCase() + data.base.toLowerCase() + data.description.toLowerCase();

			if(this.filter && this.filter != '*') {
				if(this.filter != data.installed) {
					this.grid_rows[i].control.style.display = 'none';
					continue;
				}
			}

			if(keyword == "")
				this.grid_rows[i].control.style.display = null;
			else if(content.includes(keyword)) {
				this.grid_rows[i].control.style.display = null;
			}
			else {
				this.grid_rows[i].control.style.display = 'none';
			}
		}
	}

	async invalidateControl() {
		this.clear();
		this.data = (await getModelList()).models;

		while (this.element.children.length) {
			this.element.removeChild(this.element.children[0]);
		}

		await this.createHeaderControls();

		if(this.search_keyword) {
			this.search_box.value = this.search_keyword;
		}

		await this.createGrid();
		await this.createBottomControls();

		this.apply_searchbox(this.data);
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
		header3.style.width = "100px";
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

		this.grid_rows = {};

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
					installBtn.style.color = 'white';
					installBtn.disabled = true;
					break;
				default:
					installBtn.innerHTML = 'Install';
					installBtn.style.backgroundColor = 'black';
					installBtn.style.color = 'white';
					break;
				}

				installBtn.style.width = "100px";

				installBtn.addEventListener('click', function() {
					install_model(data);
				});

				data_install.appendChild(installBtn);

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				dataRow.appendChild(data_install);
				grid.appendChild(dataRow);

				this.grid_rows[i] = {data:data, control:dataRow};
			}

		const panel = document.createElement('div');
		panel.style.height = "400px";
		panel.style.width = "1050px";
		panel.style.overflowY = "scroll";

		panel.appendChild(grid);
		this.element.appendChild(panel);
	}

	createFilterCombo() {
		let combo = document.createElement("select");

		combo.style.cssFloat = "left";
		combo.style.fontSize = "14px";
		combo.style.padding = "4px";
		combo.style.background = "black";
		combo.style.marginLeft = "2px";
		combo.style.width = "199px";
		combo.id = `combo-manger-filter`;
		combo.style.borderRadius = "15px";

		let items =
			[
				{ value:'*', text:'Filter: all' },
				{ value:'True', text:'Filter: installed' },
				{ value:'False', text:'Filter: not-installed' },
			];

		items.forEach(item => {
			const option = document.createElement("option");
			option.value = item.value;
			option.text = item.text;
			combo.appendChild(option);
		});

		let self = this;
		combo.addEventListener('change', function(event) {
			self.filter = event.target.value;
			self.apply_searchbox();
		});

		return combo;
	}

	createHeaderControls() {
		let self = this;
		this.search_box = $el('input', {type:'text', id:'manager-model-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
		this.search_box.style.height = "25px";
		this.search_box.onkeydown = (event) => {
				if (event.key === 'Enter') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
				if (event.key === 'Escape') {
					self.search_keyword = self.search_box.value;
					self.apply_searchbox();
				}
			};

		let search_button = document.createElement("button");
		search_button.innerHTML = "Search";
		search_button.onclick = () => {
			self.search_keyword = self.search_box.value;
			self.apply_searchbox();
		};
		search_button.style.display = "inline-block";

		let filter_control = this.createFilterCombo();
		filter_control.style.display = "inline-block";

		let cell = $el('td', {width:'100%'}, [filter_control, this.search_box, '  ', search_button]);
		let search_control = $el('table', {width:'100%'},
				[
					$el('tr', {}, [cell])
				]
			);

		cell.style.textAlign = "right";
		this.element.appendChild(search_control);
	}

	async createBottomControls() {
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
		const checkbox_text = $el("label",{},[" Use local DB"])
		checkbox_text.style.color = "var(--fg-color)"

		update_comfyui_button =
				$el("button", {
					type: "button",
					textContent: "Update ComfyUI",
					onclick:
						() => updateComfyUI()
				});

		fetch_updates_button =
				$el("button", {
					type: "button",
					textContent: "Fetch Updates",
					onclick:
						() => fetchUpdates()
				});

		let preview_combo = document.createElement("select");
        preview_combo.appendChild($el('option', {value:'auto', text:'Preview method: Auto'}, []));
        preview_combo.appendChild($el('option', {value:'taesd', text:'Preview method: TAESD'}, []));
        preview_combo.appendChild($el('option', {value:'latent2rgb', text:'Preview method: Latent2RGB'}, []));
        preview_combo.appendChild($el('option', {value:'none', text:'Preview method: None'}, []));

        api.fetchApi('/manager/preview_method')
        .then(response => response.text())
        .then(data => { preview_combo.value = data; })

		preview_combo.addEventListener('change', function(event) {
            api.fetchApi(`/manager/preview_method?value=${event.target.value}`);
		});

		const res =
			[
				$el("tr.td", {width:"100%"}, [$el("font", {size:6, color:"white"}, [`ComfyUI Manager Menu`])]),
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
							CustomNodesInstaller.instance.show(false);
						}
				}),

				$el("button", {
					type: "button",
					textContent: "Install Missing Custom Nodes",
					onclick:
						() => {
							if(!CustomNodesInstaller.instance)
								CustomNodesInstaller.instance = new CustomNodesInstaller(app);
							CustomNodesInstaller.instance.show(true);
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
				update_comfyui_button,
				fetch_updates_button,

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
					textContent: "ComfyUI Community Manual",
					onclick: () => { window.open("https://blenderneko.github.io/ComfyUI-docs/", "comfyui-community-manual"); }
				}),

                $el("br", {}, []),
				$el("hr", {width: "100%"}, []),
				preview_combo,
				$el("hr", {width: "100%"}, []),
                $el("br", {}, []),

				$el("button", {
					type: "button",
					textContent: "Close",
					onclick: () => this.close()
				}),
				$el("br", {}, []),
			];

		res[0].style.padding = "10px 10px 0 10px";
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
