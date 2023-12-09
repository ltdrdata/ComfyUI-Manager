import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";
import { install_checked_custom_node, manager_instance, rebootAPI } from  "./common.js";

async function getAlterList() {
	var mode = manager_instance.datasrc_combo.value;

	var skip_update = "";
	if(manager_instance.update_check_checkbox.checked)
		skip_update = "&skip_update=true";

	const response = await api.fetchApi(`/alternatives/getlist?mode=${mode}${skip_update}`);

	const data = await response.json();
	return data;
}

export class AlternativesInstaller extends ComfyDialog {
	static instance = null;

	install_buttons = [];
	message_box = null;
	data = null;

	clear() {
		this.install_buttons = [];
		this.message_box = null;
		this.data = null;
	}

	constructor(app, manager_dialog) {
		super();
		this.manager_dialog = manager_dialog;
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

	updateMessage(msg, btn_id) {
		this.message_box.innerHTML = msg;
		if(btn_id) {
			const rebootButton = document.getElementById(btn_id);
			const self = this;
			rebootButton.addEventListener("click",
				function() {
					if(rebootAPI()) {
						self.close();
						self.manager_dialog.close();
					}
				});
		}
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
		this.search_box = $el('input.cm-search-filter', {type:'text', id:'manager-alternode-search-box', placeholder:'input search keyword', value:this.search_keyword}, []);
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
		search_button.className = "cm-small-button";
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
		close_button.className = "cm-small-button";
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
			this.element.style.zIndex = 10001;
		}
		catch(exception) {
			app.ui.dialog.show(`Failed to get alternatives list. / ${exception}`);
			console.error(exception);
		}
	}
}
