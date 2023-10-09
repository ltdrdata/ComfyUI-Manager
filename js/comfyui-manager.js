import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";
import {ComfyWidgets} from "../../scripts/widgets.js";

var update_comfyui_button = null;
var fetch_updates_button = null;
var update_all_button = null;
var badge_mode = "none";

async function init_badge_mode() {
    api.fetchApi('/manager/badge_mode')
    .then(response => response.text())
    .then(data => { badge_mode = data; })
}

await init_badge_mode();

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

	var skip_update = "";
	if(ManagerMenuDialog.instance.update_check_checkbox.checked)
		skip_update = "&skip_update=true";

	const response = await api.fetchApi(`/customnode/getlist?mode=${mode}${skip_update}`);

	const data = await response.json();
	return data;
}

async function fetchNicknames() {
    const response1 = await api.fetchApi(`/customnode/getmappings?mode=local`);
    const mappings = await response1.json();

    let result = {};

    for(let i in mappings) {
        let item = mappings[i];
        var nickname;
        if(item[1].title) {
            nickname = item[1].title;
        }
        else {
            nickname = item[1].title_aux;
        }

        for(let j in item[0]) {
            result[item[0][j]] = nickname;
        }
    }

	return result;
}

let nicknames = await fetchNicknames();

async function getAlterList() {
	var mode = "url";
	if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
		mode = "local";

	var skip_update = "";
	if(ManagerMenuDialog.instance.update_check_checkbox.checked)
		skip_update = "&skip_update=true";

	const response = await api.fetchApi(`/alternatives/getlist?mode=${mode}${skip_update}`);

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

async function install_checked_custom_node(grid_rows, target_i, caller, mode) {
	if(caller) {
	    let failed = '';

        caller.disableButtons();

        for(let i in grid_rows) {
            if(!grid_rows[i].checkbox.checked && i != target_i)
                continue;

            var target;

            if(grid_rows[i].data.custom_node) {
                target = grid_rows[i].data.custom_node;
            }
            else {
                target = grid_rows[i].data;
            }

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
                    continue;
                }

                const status = await response.json();
                app.ui.dialog.close();
                target.installed = 'True';
                continue;
            }
            catch(exception) {
                failed += `<BR> ${target.title}`;
            }
		}

		if(failed != '') {
            app.ui.dialog.show(`${mode} failed: ${failed}`);
            app.ui.dialog.element.style.zIndex = 9999;
		}

        await caller.invalidateControl();
        caller.updateMessage('<BR>To apply the installed/disabled/enabled custom node, please restart ComfyUI.');
	}
}

async function updateComfyUI() {
    let prev_text = update_comfyui_button.innerText;
	update_comfyui_button.innerText = "Updating ComfyUI...";
	update_comfyui_button.disabled = true;
	update_comfyui_button.style.backgroundColor = "gray";

	try {
		const response = await api.fetchApi('/comfyui_manager/update_comfyui');

		if(response.status == 400) {
			app.ui.dialog.show('Failed to update ComfyUI.');
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
		update_comfyui_button.innerText = prev_text;
	    update_comfyui_button.style.backgroundColor = "";
	}
}

async function fetchUpdates(update_check_checkbox) {
    let prev_text = fetch_updates_button.innerText;
	fetch_updates_button.innerText = "Fetching updates...";
	fetch_updates_button.disabled = true;
	fetch_updates_button.style.backgroundColor = "gray";

	try {
		var mode = "url";
        if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
            mode = "local";

		const response = await api.fetchApi(`/customnode/fetch_updates?mode=${mode}`);

		if(response.status != 200 && response.status != 201) {
			app.ui.dialog.show('Failed to fetch updates.');
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}

		if(response.status == 201) {
			app.ui.dialog.show('There is an updated extension available.');
			app.ui.dialog.element.style.zIndex = 9999;
			update_check_checkbox.checked = false;
		}
		else {
			app.ui.dialog.show('All extensions are already up-to-date with the latest versions.');
			app.ui.dialog.element.style.zIndex = 9999;
		}

		return true;
	}
	catch(exception) {
		app.ui.dialog.show(`Failed to update custom nodes / ${exception}`);
		app.ui.dialog.element.style.zIndex = 9999;
		return false;
	}
	finally {
		fetch_updates_button.disabled = false;
		fetch_updates_button.innerText = prev_text;
		fetch_updates_button.style.backgroundColor = "";
	}
}

async function updateAll(update_check_checkbox) {
    let prev_text = update_all_button.innerText;
	update_all_button.innerText = "Updating all...(ComfyUI)";
	update_all_button.disabled = true;
	update_all_button.style.backgroundColor = "gray";

	try {
		var mode = "url";
        if(ManagerMenuDialog.instance.local_mode_checkbox.checked)
            mode = "local";

		update_all_button.innerText = "Updating all...";
		const response1 = await api.fetchApi('/comfyui_manager/update_comfyui');
		const response2 = await api.fetchApi(`/customnode/update_all?mode=${mode}`);

		if(response1.status != 200 && response2.status != 201) {
			app.ui.dialog.show('Failed to update ComfyUI or several extensions.<BR><BR>See terminal log.<BR>');
			app.ui.dialog.element.style.zIndex = 9999;
			return false;
		}
		if(response1.status == 201 || response2.status == 201) {
	        app.ui.dialog.show('ComfyUI and all extensions have been updated to the latest version.');
			app.ui.dialog.element.style.zIndex = 9999;
		}
		else {
			app.ui.dialog.show('ComfyUI and all extensions are already up-to-date with the latest versions.');
	        app.ui.dialog.element.style.zIndex = 9999;
        }

		return true;
	}
	catch(exception) {
		app.ui.dialog.show(`Failed to update ComfyUI or several extensions / ${exception}`);
		app.ui.dialog.element.style.zIndex = 9999;
		return false;
	}
	finally {
		update_all_button.disabled = false;
		update_all_button.innerText = prev_text;
		update_all_button.style.backgroundColor = "";
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
	}

	disableButtons() {
		for(let i in this.install_buttons) {
			this.install_buttons[i].disabled = true;
			this.install_buttons[i].style.backgroundColor = 'gray';
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
			for(const name in names[0]) {
				name_to_url[names[0][name]] = url;
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
				const url = name_to_url[node_type.trim()];
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
		msg.style.color = "var(--fg-color)";

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

    invalidate_checks(is_checked, install_state) {
        if(is_checked) {
            for(let i in this.grid_rows) {
                let data = this.grid_rows[i].data;
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;

                checkbox.disabled = data.installed != install_state;

                if(checkbox.disabled) {
                    for(let j in buttons) {
                        buttons[j].style.display = 'none';
                    }
                }
                else {
                    for(let j in buttons) {
                        buttons[j].style.display = null;
                    }
                }
            }

            this.checkbox_all.disabled = false;
        }
        else {
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(checkbox.check)
                    return; // do nothing
            }

            // every checkbox is unchecked -> enable all checkbox
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;
                checkbox.disabled = false;

                for(let j in buttons) {
                    buttons[j].style.display = null;
                }
            }

            this.checkbox_all.checked = false;
            this.checkbox_all.disabled = true;
        }
    }

    check_all(is_checked) {
        if(is_checked) {
            // lookup first checked item's state
            let check_state = null;
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(checkbox.checked) {
                    check_state = this.grid_rows[i].data.installed;
                }
            }

            if(check_state == null)
                return;

            // check only same state items
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(this.grid_rows[i].data.installed == check_state)
                    checkbox.checked = true;
            }
        }
        else {
            // uncheck all
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;
                checkbox.checked = false;
                checkbox.disabled = false;

                for(let j in buttons) {
                    buttons[j].style.display = null;
                }
            }

            this.checkbox_all.disabled = true;
        }
    }

	async createGrid() {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'custom-nodes-grid');

		this.grid_rows = {};

        let self = this;

        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');

		var headerRow = document.createElement('tr');
		thead.style.position = "sticky";
		thead.style.top = "0px";
        thead.style.borderCollapse = "collapse";
        thead.style.tableLayout = "fixed";

		var header0 = document.createElement('th');
		header0.style.width = "20px";
        this.checkbox_all = $el("input",{type:'checkbox', id:'check_all'},[]);
        header0.appendChild(this.checkbox_all);
        this.checkbox_all.checked = false;
        this.checkbox_all.disabled = true;
        this.checkbox_all.addEventListener('change', function() { self.check_all.call(self, self.checkbox_all.checked); });

		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Author';
		header2.style.width = "150px";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Name';
		header3.style.width = "20%";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Description';
		header4.style.width = "60%";
//        header4.classList.add('expandable-column');
		var header5 = document.createElement('th');
		header5.innerHTML = 'Install';
		header5.style.width = "130px";

		header0.style.position = "sticky";
		header0.style.top = "0px";
		header1.style.position = "sticky";
		header1.style.top = "0px";
		header2.style.position = "sticky";
		header2.style.top = "0px";
		header3.style.position = "sticky";
		header3.style.top = "0px";
		header4.style.position = "sticky";
		header4.style.top = "0px";
		header5.style.position = "sticky";
		header5.style.top = "0px";

        thead.appendChild(headerRow);
		headerRow.appendChild(header0);
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

		grid.appendChild(thead);
		grid.appendChild(tbody);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				let dataRow = document.createElement('tr');

				let data0 = document.createElement('td');
		        let checkbox = $el("input",{type:'checkbox', id:`check_${i}`},[]);
		        data0.appendChild(checkbox);
		        checkbox.checked = false;
		        checkbox.addEventListener('change', function() { self.invalidate_checks.call(self, checkbox.checked, data.installed); });

				var data1 = document.createElement('td');
				data1.style.textAlign = "center";
				data1.innerHTML = i+1;
				var data2 = document.createElement('td');
		        data2.style.maxWidth = "100px";
				data2.className = "cm-node-author"
				data2.textContent = ` ${data.author}`;
				data2.style.whiteSpace = "nowrap";
                data2.style.overflow = "hidden";
				data2.style.textOverflow = "ellipsis";
                var data3 = document.createElement('td');
                data3.style.maxWidth = "200px";
                data3.style.wordWrap = "break-word";
				data3.className = "cm-node-name"
                data3.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.title}</b></font></a>`;
				var data4 = document.createElement('td');
				data4.innerHTML = data.description;
				data4.className = "cm-node-desc"
				var data5 = document.createElement('td');
				data5.style.textAlign = "center";

				var installBtn = document.createElement('button');
				installBtn.className = "cm-btn-install";
				var installBtn2 = null;
				var installBtn3 = null;

				this.install_buttons.push(installBtn);

				switch(data.installed) {
				case 'Disabled':
					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Enable';
					installBtn3.className = "cm-btn-enable";
					installBtn3.style.backgroundColor = 'blue';
					installBtn3.style.color = 'white';
					this.install_buttons.push(installBtn3);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'Update':
					installBtn2 = document.createElement('button');
					installBtn2.innerHTML = 'Update';
					installBtn2.className = "cm-btn-update";
					installBtn2.style.backgroundColor = 'blue';
					installBtn2.style.color = 'white';
					this.install_buttons.push(installBtn2);

					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Disable';
					installBtn3.className = "cm-btn-disable";
					installBtn3.style.backgroundColor = 'MediumSlateBlue';
					installBtn3.style.color = 'white';
					this.install_buttons.push(installBtn3);

					installBtn.innerHTML = 'Uninstall';
					installBtn.style.backgroundColor = 'red';
					break;
				case 'True':
					installBtn3 = document.createElement('button');
					installBtn3.innerHTML = 'Disable';
					installBtn3.className = "cm-btn-disable";
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

                let j = i;
				if(installBtn2 != null) {
					installBtn2.style.width = "120px";
					installBtn2.addEventListener('click', function() {
						install_checked_custom_node(self.grid_rows, j, CustomNodesInstaller.instance, 'update');
					});

					data5.appendChild(installBtn2);
				}

				if(installBtn3 != null) {
					installBtn3.style.width = "120px";
					installBtn3.addEventListener('click', function() {
						install_checked_custom_node(self.grid_rows, j, CustomNodesInstaller.instance, 'toggle_active');
					});

					data5.appendChild(installBtn3);
				}

				installBtn.style.width = "120px";
				installBtn.addEventListener('click', function() {
					if(this.innerHTML == 'Uninstall') {
						if (confirm(`Are you sure uninstall ${data.title}?`)) {
							install_checked_custom_node(self.grid_rows, j, CustomNodesInstaller.instance, 'uninstall');
						}
					}
					else {
						install_checked_custom_node(self.grid_rows, j, CustomNodesInstaller.instance, 'install');
					}
				});

				data5.appendChild(installBtn);

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data0);
				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				tbody.appendChild(dataRow);

				let buttons = [];
				if(installBtn) {
				    buttons.push(installBtn);
                }
				if(installBtn2) {
				    buttons.push(installBtn2);
                }
				if(installBtn3) {
				    buttons.push(installBtn3);
                }

				this.grid_rows[i] = {data:data, buttons:buttons, checkbox:checkbox, control:dataRow};
			}

		const panel = document.createElement('div');
        panel.style.width = "100%";
		panel.appendChild(grid);

        function handleResize() {
          const parentHeight = self.element.clientHeight;
          const gridHeight = parentHeight - 200;

          grid.style.height = gridHeight + "px";
        }
		window.addEventListener("resize", handleResize);

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%";
		grid.style.height = "100%";
		grid.style.overflowY = "scroll";
		this.element.style.height = "85%";
		this.element.style.width = "80%";
		this.element.appendChild(panel);

        handleResize();
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

        if(self.filter) {
		    combo.value = self.filter;
		}

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
	}

	disableButtons() {
		for(let i in this.install_buttons) {
			this.install_buttons[i].disabled = true;
			this.install_buttons[i].style.backgroundColor = 'gray';
		}
	}

	apply_searchbox(data) {
		let keyword = this.search_box.value.toLowerCase();
		for(let i in this.grid_rows) {
			let data1 = this.grid_rows[i].data;
			let data2 = data1.custom_node;

			if(!data2)
			    continue;

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

    invalidate_checks(is_checked, install_state) {
        if(is_checked) {
            for(let i in this.grid_rows) {
                let data = this.grid_rows[i].data;
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;

                checkbox.disabled = data.custom_node.installed != install_state;

                if(checkbox.disabled) {
                    for(let j in buttons) {
                        buttons[j].style.display = 'none';
                    }
                }
                else {
                    for(let j in buttons) {
                        buttons[j].style.display = null;
                    }
                }
            }

            this.checkbox_all.disabled = false;
        }
        else {
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(checkbox.check)
                    return; // do nothing
            }

            // every checkbox is unchecked -> enable all checkbox
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;
                checkbox.disabled = false;

                for(let j in buttons) {
                    buttons[j].style.display = null;
                }
            }

            this.checkbox_all.checked = false;
            this.checkbox_all.disabled = true;
        }
    }

    check_all(is_checked) {
        if(is_checked) {
            // lookup first checked item's state
            let check_state = null;
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(checkbox.checked) {
                    check_state = this.grid_rows[i].data.custom_node.installed;
                }
            }

            if(check_state == null)
                return;

            // check only same state items
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                if(this.grid_rows[i].data.custom_node.installed == check_state)
                    checkbox.checked = true;
            }
        }
        else {
            // uncheck all
            for(let i in this.grid_rows) {
                let checkbox = this.grid_rows[i].checkbox;
                let buttons = this.grid_rows[i].buttons;
                checkbox.checked = false;
                checkbox.disabled = false;

                for(let j in buttons) {
                    buttons[j].style.display = null;
                }
            }

            this.checkbox_all.disabled = true;
        }
    }

	async createGrid() {
		var grid = document.createElement('table');
		grid.setAttribute('id', 'alternatives-grid');

		this.grid_rows = {};

        let self = this;

        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');

		var headerRow = document.createElement('tr');
		thead.style.position = "sticky";
		thead.style.top = "0px";
        thead.style.borderCollapse = "collapse";
        thead.style.tableLayout = "fixed";

		var header0 = document.createElement('th');
		header0.style.width = "20px";
        this.checkbox_all = $el("input",{type:'checkbox', id:'check_all'},[]);
        header0.appendChild(this.checkbox_all);
        this.checkbox_all.checked = false;
        this.checkbox_all.disabled = true;
        this.checkbox_all.addEventListener('change', function() { self.check_all.call(self, self.checkbox_all.checked); });

		var header1 = document.createElement('th');
		header1.innerHTML = '&nbsp;&nbsp;ID&nbsp;&nbsp;';
		header1.style.width = "20px";
		var header2 = document.createElement('th');
		header2.innerHTML = 'Tags';
		header2.style.width = "10%";
		var header3 = document.createElement('th');
		header3.innerHTML = 'Author';
		header3.style.width = "150px";
		var header4 = document.createElement('th');
		header4.innerHTML = 'Title';
		header4.style.width = "20%";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Description';
		header5.style.width = "50%";
		var header6 = document.createElement('th');
		header6.innerHTML = 'Install';
		header6.style.width = "130px";

		header1.style.position = "sticky";
		header1.style.top = "0px";
		header2.style.position = "sticky";
		header2.style.top = "0px";
		header3.style.position = "sticky";
		header3.style.top = "0px";
		header4.style.position = "sticky";
		header4.style.top = "0px";
		header5.style.position = "sticky";
		header5.style.top = "0px";

        thead.appendChild(headerRow);
		headerRow.appendChild(header0);
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

		grid.appendChild(thead);
		grid.appendChild(tbody);

		if(this.data)
			for (var i = 0; i < this.data.length; i++) {
				const data = this.data[i];
				var dataRow = document.createElement('tr');

                let data0 = document.createElement('td');
		        let checkbox = $el("input",{type:'checkbox', id:`check_${i}`},[]);
		        data0.appendChild(checkbox);
		        checkbox.checked = false;
		        checkbox.addEventListener('change', function() { self.invalidate_checks.call(self, checkbox.checked, data.custom_node?.installed); });

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

                var installBtn = document.createElement('button');
                var installBtn2 = null;
                var installBtn3 = null;

				if(data.custom_node) {
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

                    let j = i;
					if(installBtn2 != null) {
						installBtn2.style.width = "120px";
						installBtn2.addEventListener('click', function() {
							install_checked_custom_node(self.grid_rows, j, AlternativesInstaller.instance, 'update');
						});

						data6.appendChild(installBtn2);
					}

					if(installBtn3 != null) {
						installBtn3.style.width = "120px";
						installBtn3.addEventListener('click', function() {
							install_checked_custom_node(self.grid_rows, j, AlternativesInstaller.instance, 'toggle_active');
						});

						data6.appendChild(installBtn3);
					}


					installBtn.style.width = "120px";
					installBtn.addEventListener('click', function() {
						if(this.innerHTML == 'Uninstall') {
							if (confirm(`Are you sure uninstall ${data.title}?`)) {
								install_checked_custom_node(self.grid_rows, j, AlternativesInstaller.instance, 'uninstall');
							}
						}
						else {
							install_checked_custom_node(self.grid_rows, j, AlternativesInstaller.instance, 'install');
						}
					});

					data6.appendChild(installBtn);
				}

				dataRow.style.backgroundColor = "var(--bg-color)";
				dataRow.style.color = "var(--fg-color)";
				dataRow.style.textAlign = "left";

				dataRow.appendChild(data0);
				dataRow.appendChild(data1);
				dataRow.appendChild(data2);
				dataRow.appendChild(data3);
				dataRow.appendChild(data4);
				dataRow.appendChild(data5);
				dataRow.appendChild(data6);
				tbody.appendChild(dataRow);

				let buttons = [];
				if(installBtn) {
				    buttons.push(installBtn);
                }
				if(installBtn2) {
				    buttons.push(installBtn2);
                }
				if(installBtn3) {
				    buttons.push(installBtn3);
                }

				this.grid_rows[i] = {data:data, buttons:buttons, checkbox:checkbox, control:dataRow};
			}

		const panel = document.createElement('div');
        panel.style.width = "100%";
		panel.appendChild(grid);

        function handleResize() {
          const parentHeight = self.element.clientHeight;
          const gridHeight = parentHeight - 200;

          grid.style.height = gridHeight + "px";
        }
		window.addEventListener("resize", handleResize);

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%";
		grid.style.height = "100%";
		grid.style.overflowY = "scroll";
		this.element.style.height = "85%";
		this.element.style.width = "80%";
		this.element.appendChild(panel);

        handleResize();
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

        if(self.filter) {
		    combo.value = self.filter;
		}

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

        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');

		var headerRow = document.createElement('tr');
		thead.style.position = "sticky";
		thead.style.top = "0px";
        thead.style.borderCollapse = "collapse";
        thead.style.tableLayout = "fixed";

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
		header4.style.width = "30%";
		var header5 = document.createElement('th');
		header5.innerHTML = 'Filename';
		header5.style.width = "20%";
		header5.style.tableLayout = "fixed";
		var header6 = document.createElement('th');
		header6.innerHTML = 'Description';
		header6.style.width = "50%";
		var header_down = document.createElement('th');
		header_down.innerHTML = 'Download';
		header_down.style.width = "50px";

        thead.appendChild(headerRow);
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

		grid.appendChild(thead);
		grid.appendChild(tbody);

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
				data4.className = "cm-node-name";
				data4.innerHTML = `&nbsp;<a href=${data.reference} target="_blank"><font color="skyblue"><b>${data.name}</b></font></a>`;
				var data5 = document.createElement('td');
				data5.className = "cm-node-filename";
				data5.innerHTML = `&nbsp;${data.filename}`;
				data5.style.wordBreak = "break-all";
				var data6 = document.createElement('td');
				data6.className = "cm-node-desc";
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
				tbody.appendChild(dataRow);

				this.grid_rows[i] = {data:data, control:dataRow};
			}

        let self = this;
		const panel = document.createElement('div');
        panel.style.width = "100%";
		panel.appendChild(grid);

        function handleResize() {
          const parentHeight = self.element.clientHeight;
          const gridHeight = parentHeight - 200;

          grid.style.height = gridHeight + "px";
        }
		window.addEventListener("resize", handleResize);

		grid.style.position = "relative";
		grid.style.display = "inline-block";
		grid.style.width = "100%";
		grid.style.height = "100%";
		grid.style.overflowY = "scroll";
		this.element.style.height = "85%";
		this.element.style.width = "80%";
		this.element.appendChild(panel);

        handleResize();
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
		checkbox_text.style.color = "var(--fg-color)";
		checkbox_text.style.marginRight = "10px";

		this.update_check_checkbox = $el("input",{type:'checkbox', id:"skip_update_check"},[])
		const uc_checkbox_text = $el("label",{},[" Skip update check"])
		uc_checkbox_text.style.color = "var(--fg-color)";
		this.update_check_checkbox.checked = true;

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
						() => fetchUpdates(this.update_check_checkbox)
				});

		update_all_button =
				$el("button", {
					type: "button",
					textContent: "Update All",
					onclick:
						() => updateAll(this.update_check_checkbox)
				});

        // preview method
		let preview_combo = document.createElement("select");
        preview_combo.appendChild($el('option', {value:'auto', text:'Preview method: Auto'}, []));
        preview_combo.appendChild($el('option', {value:'taesd', text:'Preview method: TAESD (slow)'}, []));
        preview_combo.appendChild($el('option', {value:'latent2rgb', text:'Preview method: Latent2RGB (fast)'}, []));
        preview_combo.appendChild($el('option', {value:'none', text:'Preview method: None (very fast)'}, []));

        api.fetchApi('/manager/preview_method')
        .then(response => response.text())
        .then(data => { preview_combo.value = data; })

		preview_combo.addEventListener('change', function(event) {
            api.fetchApi(`/manager/preview_method?value=${event.target.value}`);
		});

        // nickname
		let badge_combo = document.createElement("select");
        badge_combo.appendChild($el('option', {value:'none', text:'Badge: None'}, []));
        badge_combo.appendChild($el('option', {value:'nick', text:'Badge: Nickname'}, []));
        badge_combo.appendChild($el('option', {value:'id_nick', text:'Badge: #ID Nickname'}, []));

        api.fetchApi('/manager/badge_mode')
        .then(response => response.text())
        .then(data => { badge_combo.value = data; badge_mode = data; });

		badge_combo.addEventListener('change', function(event) {
            api.fetchApi(`/manager/badge_mode?value=${event.target.value}`);
            badge_mode = event.target.value;
            app.graph.setDirtyCanvas(true);
		});

        // channel
		let channel_combo = document.createElement("select");
        api.fetchApi('/manager/channel_url_list')
        .then(response => response.json())
        .then(async data => {
            try {
				let urls = data.list;
				for(let i in urls) {
					if(urls[i] != '') {
						let name_url = urls[i].split('::');
	                    channel_combo.appendChild($el('option', {value:name_url[0], text:`Channel: ${name_url[0]}`}, []));
	                }
	            }

				channel_combo.addEventListener('change', function(event) {
		            api.fetchApi(`/manager/channel_url_list?value=${event.target.value}`);
				});

                channel_combo.value = data.selected;
			}
			catch(exception) {

			}
        });

		const res =
			[
				$el("tr.td", {width:"100%"}, [$el("font", {size:6, color:"white"}, [`ComfyUI Manager Menu`])]),
				$el("br", {}, []),
				$el("div", {}, [this.local_mode_checkbox, checkbox_text, this.update_check_checkbox, uc_checkbox_text]),
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
				update_all_button,
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
				$el("button", {
					type: "button",
					textContent: "ComfyUI Workflow Gallery",
					onclick: () => { window.open("https://comfyworkflows.com/", "comfyui-workflow-gallery"); }
				}),

				$el("button", {
					type: "button",
					textContent: "ComfyUI Nodes Info",
					onclick: () => { window.open("https://ltdrdata.github.io/", "comfyui-node-info"); }
				}),

                $el("br", {}, []),
				$el("hr", {width: "100%"}, []),
				preview_combo,
				badge_combo,
				channel_combo,
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
	},

	async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const r = onDrawForeground?.apply?.(this, arguments);

            if(!this.flags.collapsed && badge_mode != 'none' && nodeType.title_mode != LiteGraph.NO_TITLE) {
                let text = "";
                if(badge_mode == 'id_nick')
                    text = `#${this.id} `;

                if(nicknames[nodeData.name.trim()]) {
                    let nick = nicknames[nodeData.name.trim()];

                    if(nick.length > 25) {
                        text += nick.substring(0,23)+"..";
                    }
                    else {
                        text += nick;
                    }
                }

                if(text != "") {
                    let fgColor = "white";
                    let bgColor = "#0F1F0F";
                    let visible = true;

                    ctx.save();
                    ctx.font = "12px sans-serif";
                    const sz = ctx.measureText(text);
                    ctx.fillStyle = bgColor;
                    ctx.beginPath();
                    ctx.roundRect(this.size[0]-sz.width-12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
                    ctx.fill();

                    ctx.fillStyle = fgColor;
                    ctx.fillText(text, this.size[0]-sz.width-6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
                    ctx.restore();
                }
            }

            return r;
        };
	},

	async loadedGraphNode(node, app) {
	    if(node.has_errors) {
            const onDrawForeground = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const r = onDrawForeground?.apply?.(this, arguments);

                if(!this.flags.collapsed && badge_mode != 'none') {
                    let text = "";
                    if(badge_mode == 'id_nick')
                        text = `#${this.id} `;

                    if(nicknames[node.type.trim()]) {
                        let nick = nicknames[node.type.trim()];

                        if(nick.length > 25) {
                            text += nick.substring(0,23)+"..";
                        }
                        else {
                            text += nick;
                        }
                    }

                    if(text != "") {
                        let fgColor = "white";
                        let bgColor = "#0F1F0F";
                        let visible = true;

                        ctx.save();
                        ctx.font = "12px sans-serif";
                        const sz = ctx.measureText(text);
                        ctx.fillStyle = bgColor;
                        ctx.beginPath();
                        ctx.roundRect(this.size[0]-sz.width-12, -LiteGraph.NODE_TITLE_HEIGHT - 20, sz.width + 12, 20, 5);
                        ctx.fill();

                        ctx.fillStyle = fgColor;
                        ctx.fillText(text, this.size[0]-sz.width-6, -LiteGraph.NODE_TITLE_HEIGHT - 6);
                        ctx.restore();

                        ctx.save();
                        ctx.font = "bold 14px sans-serif";
                        const sz2 = ctx.measureText(node.type);
                        ctx.fillStyle = 'white';
                        ctx.fillText(node.type, this.size[0]/2-sz2.width/2, this.size[1]/2);
                        ctx.restore();
                    }
                }

                return r;
            };
	    }
	}
});
