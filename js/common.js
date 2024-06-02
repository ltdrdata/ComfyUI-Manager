import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

export function show_message(msg) {
	app.ui.dialog.show(msg);
	app.ui.dialog.element.style.zIndex = 10010;
}

export async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function rebootAPI() {
	if (confirm("Are you sure you'd like to reboot the server?")) {
		try {
			api.fetchApi("/manager/reboot");
		}
		catch(exception) {

		}
		return true;
	}

	return false;
}

export async function install_checked_custom_node(grid_rows, target_i, caller, mode) {
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

				if(response.status == 403) {
					show_message('This action is not allowed with this security level configuration.');
					caller.updateMessage('');
					await caller.invalidateControl();
					return;
				}

				if(response.status == 404) {
					show_message('With the current security level configuration, only custom nodes from the <B>"default channel"</B> can be installed.');
					caller.updateMessage('');
					await caller.invalidateControl();
					return;
				}

				if(response.status == 400) {
					show_message(`${mode} failed: ${target.title}`);
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
			show_message(`${mode} failed: ${failed}`);
		}

		await caller.invalidateControl();
		caller.updateMessage("<BR>To apply the installed/updated/disabled/enabled custom node, please <button id='cm-reboot-button1' class='cm-small-button'>RESTART</button> ComfyUI. And refresh browser.", 'cm-reboot-button1');
	}
};

export var manager_instance = null;

export function setManagerInstance(obj) {
	manager_instance = obj;
}

function isValidURL(url) {
	if(url.includes('&'))
		return false;

	const pattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/;
	return pattern.test(url);
}

export async function install_pip(packages) {
	if(packages.includes('&'))
		app.ui.dialog.show(`Invalid PIP package enumeration: '${packages}'`);

	const res = await api.fetchApi("/customnode/install/pip", {
		method: "POST",
		body: packages,
	});

	if(res.status == 403) {
		show_message('This action is not allowed with this security level configuration.');
		return;
	}

	if(res.status == 200) {
		show_message(`PIP package installation is processed.<br>To apply the pip packages, please click the <button id='cm-reboot-button3'><font size='3px'>RESTART</font></button> button in ComfyUI.`);

		const rebootButton = document.getElementById('cm-reboot-button3');
		const self = this;

		rebootButton.addEventListener("click", rebootAPI);
	}
	else {
		show_message(`Failed to install '${packages}'<BR>See terminal log.`);
	}
}

export async function install_via_git_url(url, manager_dialog) {
	if(!url) {
		return;
	}

	if(!isValidURL(url)) {
		show_message(`Invalid Git url '${url}'`);
		return;
	}

	show_message(`Wait...<BR><BR>Installing '${url}'`);

	const res = await api.fetchApi("/customnode/install/git_url", {
		method: "POST",
		body: url,
	});

	if(res.status == 403) {
		show_message('This action is not allowed with this security level configuration.');
		return;
	}

	if(res.status == 200) {
		show_message(`'${url}' is installed<BR>To apply the installed custom node, please <button id='cm-reboot-button4'><font size='3px'>RESTART</font></button> ComfyUI.`);

		const rebootButton = document.getElementById('cm-reboot-button4');
		const self = this;

		rebootButton.addEventListener("click",
			function() {
				if(rebootAPI()) {
					manager_dialog.close();
				}
			});
	}
	else {
		show_message(`Failed to install '${url}'<BR>See terminal log.`);
	}
}

export async function free_models() {
	let res = await api.fetchApi(`/free`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: '{"unload_models": true}'
					});

	if(res.status == 200) {
		show_message('Models have been unloaded.')
	}
	else {
		show_message('Unloading of models failed.<BR><BR>Installed ComfyUI may be an outdated version.')
	}
}
