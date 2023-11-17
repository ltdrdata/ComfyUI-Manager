import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyDialog, $el } from "../../scripts/ui.js";

const LOCAL_STORAGE_KEY = "openart_comfy_workflow_key";
const DEFAULT_HOMEPAGE_URL = "https://openart.ai/workflows/dev?developer=true";

// const API_ENDPOINT = "https://openart.ai/api";
const API_ENDPOINT = "http://localhost:8080/api";

const style = `
.openart-share-dialog a {
	color: #f8f8f8;
}
.openart-share-dialog a:hover {
	color: #007bff;
}
`;

export class OpenArtShareDialog extends ComfyDialog {
  static instance = null;

  constructor() {
    super();
    $el("style", {
      textContent: style,
      parent: document.head,
    });
    this.element = $el(
      "div.comfy-modal.openart-share-dialog",
      {
        parent: document.body,
        style: {
          "overflow-y": "auto",
        },
      },
      [$el("div.comfy-modal-content", {}, [...this.createButtons()])]
    );
    this.selectedOutputIndex = 0;
    this.uploadedImages = [];
  }
  readKeyFromLocalStorage() {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || "";
  }
  saveKeyToLocalStorage(value) {
    localStorage.setItem(LOCAL_STORAGE_KEY, value);
  }
  createButtons() {
    const sectionStyle = {
      marginBottom: "10px",
      padding: "15px",
      borderRadius: "8px",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
    };

    const inputStyle = {
      display: "block",
      minWidth: "500px",
      width: "100%",
      padding: "10px",
      margin: "10px 0",
      borderRadius: "4px",
      border: "1px solid #ddd",
      boxSizing: "border-box",
    };

    const hyperLinkStyle = {
      display: "block",
      marginBottom: "15px",
      fontWeight: "bold",
      fontSize: "20px",
    };

    const labelStyle = {
      color: "#f8f8f8",
      display: "block",
      margin: "10px 0",
      fontWeight: "bold",
      textDecoration: "none",
    };

    const buttonStyle = {
      padding: "10px 80px",
      margin: "10px 5px",
      borderRadius: "4px",
      border: "none",
      cursor: "pointer",
      color: "#fff",
      backgroundColor: "#007bff",
    };

    // upload images input
    this.uploadImagesInput = $el("input", {
      type: "file",
      multiple: false,
      style: inputStyle,
    });

    this.uploadImagesInput.addEventListener("change", async (e) => {
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
    this.previewImage = $el("img", {
      src: "",
      style: { maxWidth: "100%", maxHeight: "100px" },
    });

    this.keyInput = $el("input", {
      type: "text",
      placeholder: "Copy & paste your API key",
      style: inputStyle,
    });
    this.NameInput = $el("input", {
      type: "text",
      placeholder: "Name (required)",
      style: inputStyle,
    });
    this.descriptionInput = $el("textarea", {
      placeholder: "Description (optional)",
      style: {
        ...inputStyle,
        minHeight: "100px",
      },
    });

    // Account Section
    const AccountSection = $el("div", { style: sectionStyle }, [
      $el("a", { style: hyperLinkStyle, href: DEFAULT_HOMEPAGE_URL }, [
        "Check out 1000+ workflows others have uploaded.",
      ]),
      $el("a", { style: hyperLinkStyle, href: DEFAULT_HOMEPAGE_URL }, [
        "You can get API key at here.",
      ]),
      $el("label", { style: labelStyle }, ["OpenArt API Key"]),
      this.keyInput,
    ]);

    // Additional Inputs Section
    const additionalInputsSection = $el("div", { style: sectionStyle }, [
      $el("label", { style: labelStyle }, ["Image/Thumbnail (Required)"]),
      this.uploadImagesInput,
      this.previewImage,
      $el("label", { style: labelStyle }, ["Workflow Information"]),
      this.NameInput,
      this.descriptionInput,
    ]);

    this.shareButton = $el("button", {
      type: "submit",
      textContent: "Share",
      style: buttonStyle,
      onclick: () => {
        this.handleShareButtonClick();
      },
    });

    // Share and Close Buttons
    const buttonsSection = $el(
      "div",
      {
        style: {
          textAlign: "right",
          marginTop: "20px",
          display: "flex",
          justifyContent: "space-between",
        },
      },
      [
        $el("button", {
          type: "button",
          textContent: "Close",
          style: {
            ...buttonStyle,
            backgroundColor: undefined,
          },
          onclick: () => {
            this.close();
          },
        }),
        this.shareButton,
      ]
    );

    // Message Section
    this.message = $el(
      "div",
      {
        style: {
          color: "#ff3d00",
          textAlign: "center",
          padding: "10px",
          fontSize: "20px",
        },
      },
      []
    );
    // Composing the full layout
    const layout = [
      AccountSection,
      additionalInputsSection,
      this.message,
      buttonsSection,
    ];

    return layout;
  }
  async fetchApi(path, options, statusText) {
    if (statusText) {
      this.message.textContent = statusText;
    }
    const addSearchParams = (url, params = {}) =>
      new URL(
        `${url.origin}${url.pathname}?${new URLSearchParams([
          ...Array.from(url.searchParams.entries()),
          ...Object.entries(params),
        ])}`
      );
	
	const fullPath = addSearchParams(new URL(API_ENDPOINT + path), {
		workflow_api_key: this.keyInput.value,
	});

    const response = await fetch(fullPath, options);

    if (statusText) {
      this.message.textContent = "";
    }

    return await response.json();
  }
  async uploadThumbnail(uploadFile) {
    const form = new FormData();
    form.append("file", uploadFile);
    try {
      const res = await this.fetchApi(
        `/workflows/upload_thumbnail`,
        {
          method: "POST",
          body: form,
        },
        "Uploading thumbnail..."
      );
      if (res.status === 200 && res.data) {
        const { image_url, width, height } = res.data;
        this.uploadedImages.push({
          url: image_url,
          width,
          height,
        });
      }
    } catch (e) {
      if (e?.response?.status === 413) {
        throw new Error("File size is too large (max 20MB)");
      } else {
        throw new Error("Error uploading thumbnail: " + e.message);
      }
    }
  }
  async handleShareButtonClick() {
    try {
      this.shareButton.disabled = true;
      this.shareButton.textContent = "Sharing...";
      await this.share();
    } catch (e) {
      alert(e.message);
    }
	this.shareButton.disabled = false;
	this.shareButton.textContent = "Share";
	this.message.textContent = "";
	this.uploadedImages = [];
  }
  async share() {
    this.uploadedImages = [];
    const prompt = await app.graphToPrompt();
    const workflowJSON = prompt["workflow"];
    const form_values = {
      name: this.NameInput.value,
      description: this.descriptionInput.value,
    };

    if (!this.keyInput.value) {
      throw new Error("API key is required");
    }

    if (!this.uploadImagesInput.files[0]) {
      throw new Error("Thumbnail is required");
    }

    if (!form_values.name) {
      throw new Error("Name is required");
    }

    for (const file of this.uploadImagesInput.files) {
      await this.uploadThumbnail(file);
    }

    if (this.uploadImagesInput.files.length === 0) {
      throw new Error("No thumbnail uploaded");
    }

    try {
      const response = await this.fetchApi(
        "/workflows/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflow_json: workflowJSON,
            upload_images: this.uploadedImages,
            form_values,
          }),
        },
        "Uploading workflow..."
      );

      if (response.status === 200) {
        console.log(response.data);
        this.saveKeyToLocalStorage(this.keyInput.value);
      }
    } catch (e) {
      throw new Error("Error sharing workflow: " + e.message);
    }
  }
  show({ potential_outputs, potential_output_nodes }) {
    this.element.style.display = "block";
    // read key from local storage and set it to the input
    const key = this.readKeyFromLocalStorage();
    this.keyInput.value = key;
  }
}
