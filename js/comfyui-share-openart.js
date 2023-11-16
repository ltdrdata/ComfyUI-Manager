import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js"
import { ComfyDialog, $el } from "../../scripts/ui.js";

const LOCAL_STORAGE_KEY = "openart_comfy_workflow_key";

export class OpenArtShareDialog extends ComfyDialog {
	static instance = null;

	constructor() {
		super();
		this.element = $el("div.comfy-modal", {
			parent: document.body, style: {
				'overflow-y': "auto",
			}
		},
			[$el("div.comfy-modal-content",
				{},
				[...this.createButtons()]),
			]);
		this.selectedOutputIndex = 0;
	}
	readKeyFromLocalStorage() {
		return localStorage.getItem(LOCAL_STORAGE_KEY) || '';
	}
	saveKeyToLocalStorage(value) {
		localStorage.setItem(LOCAL_STORAGE_KEY, value);
	}
	createButtons() {
        const sectionStyle = {
            marginBottom: '10px',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        };

        const inputStyle = {
			display: 'block',
			minWidth: '500px',
            width: '100%',
            padding: '10px',
            margin: '10px 0',
            borderRadius: '4px',
            border: '1px solid #ddd',
            boxSizing: 'border-box'
        };

		const headerLabelStyle = {
			color: "#f8f8f8",
			display: 'block',
			marginBottom: '15px',
			fontWeight: 'bold',
			textDecoration: 'none',
			fontSize: '20px',
		};

        const labelStyle = {
			color: "#f8f8f8",
            display: 'block',
            margin: '10px 0',
            fontWeight: 'bold',
			textDecoration: 'none',
        };

        const buttonStyle = {
            padding: '10px 80px',
            margin: '10px 5px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            color: '#fff',
            backgroundColor: '#007bff'
        };

		// upload images input
		this.uploadImagesInput = $el("input", { type: 'file', multiple: false, style: inputStyle })
		
		this.uploadImagesInput.addEventListener('change', async (e) => {
			const file = e.target.files[0];
			if (!file) {
				return;
			}
			const reader = new FileReader();
			reader.onload = async (e) => {
				const imgData = e.target.result;
				this.previewImage.src = imgData;
			};
			reader.readAsDataURL(file);
		});

		// preview image
		this.previewImage = $el("img", { src: "", style: { maxWidth: '100%', maxHeight: '100px' } });

		this.keyInput = $el("input", { type: 'text', placeholder: "Copy & paste your API key", style: inputStyle })
		// Account Section
		const AccountSection = $el("div", { style: sectionStyle }, [
			$el("a", { style: headerLabelStyle, href: "https://openart.ai/workflows" }, ["Check out 1000+ workflows others have uploaded."]),
			$el("a", { style: headerLabelStyle, href: "https://openart.ai/workflows" }, ["You can get API key at https://openart.ai/"]),
			$el("label", { style: labelStyle }, ["OpenArt API Key"]),
			this.keyInput,
		]);

		// Additional Inputs Section
		const additionalInputsSection = $el("div", { style: sectionStyle }, [
			$el("label", { style: labelStyle }, ["Image/Thumbnail (Required)"]),
			this.uploadImagesInput,
			this.previewImage,
			$el("label", { style: labelStyle }, ["Workflow Information"]),
			$el("input", { type: "text", placeholder: "Title (required)", style: inputStyle }),
			$el("textarea", { placeholder: "Description (optional)", style: {
				...inputStyle,
				minHeight: '100px',
	 		} }),
		]);

		// Share and Close Buttons
		const buttonsSection = $el("div", { style: { textAlign: 'right', marginTop: '20px', display: 'flex', justifyContent: 'space-between' } }, [
			$el("button", { type: "button", textContent: "Close", style: {
				...buttonStyle,
				backgroundColor: undefined
			}, onclick: () => { this.close(); } }),
			$el("button", { type: "submit", textContent: "Share", style: buttonStyle, onclick: () => { this.share(); } }),
		]);

		// Final Message Section
		const finalMessage = $el("div", { style: { color: "white", textAlign: "center", padding: "10px" } }, []);
		// Composing the full layout
		const layout = [
			AccountSection,
			additionalInputsSection,
			buttonsSection,
			finalMessage,
		];

		return layout;
    }
	async share() {
		this.saveKeyToLocalStorage(this.keyInput.value);
	}
	show({ potential_outputs, potential_output_nodes }) {
		this.element.style.display = "block";
		// read key from local storage and set it to the input
		const key = this.readKeyFromLocalStorage();
		this.keyInput.value = key;
	}
}