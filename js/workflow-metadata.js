/**
 * Attaches metadata to the workflow on save
 * - custom node pack version to all custom nodes used in the workflow
 *
 * Example metadata:
 * "nodes": {
 *   "1": {
 *     type: "CheckpointLoaderSimple",
 *     ...
 *     properties: {
 *       cnr_id: "comfy-core",
 *       version: "0.3.8",
 *     },
 *   },
 * }
 *
 * @typedef {Object} NodeInfo
 * @property {string} ver - Version (git hash or semantic version)
 * @property {string} cnr_id - ComfyRegistry node ID
 * @property {boolean} enabled - Whether the node is enabled
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

class WorkflowMetadataExtension {
  constructor() {
    this.name = "Comfy.CustomNodesManager.WorkflowMetadata";
    this.installedNodes = {};
    this.comfyCoreVersion = null;
  }

  /**
   * Get the installed nodes info
   * @returns {Promise<Record<string, NodeInfo>>} The mapping from node name to its info.
   * ver can either be a git commit hash or a semantic version such as "1.0.0"
   * cnr_id is the id of the node in the ComfyRegistry
   * enabled is true if the node is enabled, false if it is disabled
   */
  async getInstalledNodes() {
    const res = await api.fetchApi("/customnode/installed");
    return await res.json();
  }

  /**
   * Set node versions for the given graph
   * @param {LGraph} graph The graph to process
   * @param {Object} workflow The serialized workflow object
   */
  setGraphNodeVersions(graph, workflow) {
    if (!graph?.nodes || !workflow?.nodes) return;

    // Create a map of workflow nodes by ID
    const workflowNodesById = {};
    for (const node of workflow.nodes) {
      if (node.id != null) {
        workflowNodesById[node.id] = node;
      }
    }

    // Process each graph node and find its corresponding workflow node by ID
    for (const graphNode of graph.nodes) {
      const workflowNode = workflowNodesById[graphNode.id];
      if (!workflowNode) continue;
      this.setNodeVersion(graphNode, workflowNode);
    }
  }

  /**
   * Set version information for a single node
   * @param {Object} graphNode The graph node
   * @param {Object} workflowNode The workflow node
   */
  setNodeVersion(graphNode, workflowNode) {
    const nodeProperties = (workflowNode.properties ??= {});
    const nodeData = graphNode.constructor?.nodeData;

    // The node is missing or is a frontend only node
    // (node was not constructed in registerNodes closure where nodeData is set)
    if (!nodeData) {
      return;
    }

    const modules = nodeData.python_module.split(".");
    const moduleType = modules[0];

    if (moduleType === "custom_nodes") {
      this.setCustomNodeVersion(modules[1], nodeProperties);
    } else if (["nodes", "comfy_extras"].includes(moduleType)) {
      this.setCoreNodeVersion(nodeProperties);
    } else {
      console.warn(`Unknown node source: ${nodeData.python_module}`);
    }
  }

  /**
   * Set version for custom nodes
   * @private
   */
  setCustomNodeVersion(nodePackageName, nodeProperties) {
    const nodeInfo =
      this.installedNodes[nodePackageName] ??
      this.installedNodes[nodePackageName.toLowerCase()];

    if (nodeInfo) {
      if (nodeInfo.cnr_id === "comfy-core") return; // reserved package name
      // Preserve workflow cnr_id and version if they exist
      nodeProperties.cnr_id ??= nodeInfo.cnr_id;
      nodeProperties.version ??= nodeInfo.ver;
    }
  }

  /**
   * Set version for core nodes
   * @private
   */
  setCoreNodeVersion(nodeProperties) {
    nodeProperties.cnr_id ??= "comfy-core";
    nodeProperties.version ??= this.comfyCoreVersion;
  }

  async init() {
    const extension = this;
    this.installedNodes = await this.getInstalledNodes();
    this.comfyCoreVersion = (await api.getSystemStats()).system.comfyui_version;

    // Attach metadata when app.graphToPrompt is called.
    const originalSerialize = LGraph.prototype.serialize;
    LGraph.prototype.serialize = function () {
      const workflow = originalSerialize.apply(this, arguments);

      // Add metadata to the nodes
      const graph = this;
      try {
        extension.setGraphNodeVersions(graph, workflow);
      } catch (e) {
        console.error(e);
      }
      return workflow;
    };
  }
}

app.registerExtension(new WorkflowMetadataExtension());
