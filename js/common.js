import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"

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

                if(response.status == 400) {
                    app.ui.dialog.show(`${mode} failed: ${target.title}`);
                    app.ui.dialog.element.style.zIndex = 10010;
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
            app.ui.dialog.element.style.zIndex = 10010;
		}

        await caller.invalidateControl();
        caller.updateMessage('<BR>To apply the installed/disabled/enabled custom node, please restart ComfyUI.');
	}
};

export var manager_instance = null;

export function setManagerInstance(obj) {
    manager_instance = obj;
}