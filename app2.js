// Configuration
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxTU-v7OT8SLeuZrV3numgl2tGsFPnlC5fCXsonfKMDm1xtHtVfFDA4RPe5Da2xJIe_7A/exec"; // Replace with your actual Apps Script URL

const ROOT_FOLDER_ID = "1xfnB19Nvk0am-REJr-q9wqLoTAU3S55N";

// DOM Elements
const foldersContainer = document.getElementById("folders-container");
const foldersList = document.getElementById("folders-list");
const loadingFolders = document.getElementById("loading-folders");
const folderSearch = document.getElementById("folder-search");
const welcomeMessage = document.getElementById("welcome-message");
const contentContainer = document.getElementById("content-container");
const subjectHeader = document.getElementById("subject-header");
const subjectName = document.getElementById("subject-name");
const contentList = document.getElementById("content-list");
const loadingContent = document.getElementById("loading-content");
const emptyFolderMessage = document.getElementById("empty-folder-message");
const previewModal = document.getElementById("preview-modal");
const previewFilename = document.getElementById("preview-filename");
const previewContainer = document.getElementById("preview-container");
const previewLoading = document.getElementById("preview-loading");
const previewError = document.getElementById("preview-error");
const errorMessage = document.getElementById("error-message");
const pdfContainer = document.getElementById("pdf-container");
const docxContainer = document.getElementById("docx-container");
const docPreviewIframe = document.getElementById("doc-preview-iframe");
const closeModal = document.getElementById("close-modal");
const printButton = document.getElementById("print-button");
const downloadButton = document.getElementById("download-button");

// State
let currentFolderId = null;
let currentSubject = null;
let currentFileId = null;
let currentPreviewUrl = null;
let currentFileBlob = null; // Store the data URI for PDFs
let allFolders = [];

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
});

// Initialize the app
async function initApp() {
  try {
    await loadFolders(ROOT_FOLDER_ID);
  } catch (error) {
    console.error("Error initializing app:", error);
    showErrorMessage(
      foldersList,
      "Failed to load folders. Please refresh the page."
    );
  }
}

// Setup event listeners
function setupEventListeners() {
  closeModal.addEventListener("click", () => {
    previewModal.classList.add("hidden");
    if (currentPreviewUrl) {
      revokeTemporaryAccess(currentFileId).catch((e) =>
        console.error("Failed to revoke temporary access:", e)
      );
      currentPreviewUrl = null;
    }
    docPreviewIframe.src = ""; // Reset iframe src on close
    currentFileBlob = null; // Reset file blob
    printButton.classList.remove("hidden"); // Reset print button visibility
  });

  previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add("hidden");
      if (currentPreviewUrl) {
        revokeTemporaryAccess(currentFileId).catch((e) =>
          console.error("Failed to revoke temporary access:", e)
        );
        currentPreviewUrl = null;
      }
      docPreviewIframe.src = ""; // Reset iframe src on close
      currentFileBlob = null; // Reset file blob
      printButton.classList.remove("hidden"); // Reset print button visibility
    }
  });

  printButton.addEventListener("click", printFile);
  downloadButton.addEventListener("click", downloadFile);
  folderSearch.addEventListener("input", (e) =>
    filterFolders(e.target.value.toLowerCase())
  );
}

// Filter folders based on search term
function filterFolders(searchTerm) {
  const folderItems = foldersList.querySelectorAll(".folder-item");
  folderItems.forEach((item) => {
    const folderName = item
      .querySelector(".folder-name")
      .textContent.toLowerCase();
    item.classList.toggle("hidden", !folderName.includes(searchTerm));
  });
}

// Load folders from Google Drive
async function loadFolders(folderId) {
  foldersList.innerHTML = "";
  loadingFolders.classList.remove("hidden");
  try {
    const folders = await fetchFolders(folderId);
    allFolders = folders;
    if (folders.length === 0) {
      foldersList.innerHTML =
        '<div class="p-3 text-center text-gray-500">No folders found</div>';
    } else {
      renderFolders(folders);
    }
  } catch (error) {
    console.error("Error loading folders:", error);
    showErrorMessage(foldersList, "Failed to load folders");
  } finally {
    loadingFolders.classList.add("hidden");
  }
}

// Render folders in the left pane
function renderFolders(folders) {
  folders.forEach((folder) => {
    const folderItem = document.createElement("div");
    folderItem.className = "folder-item p-3 hover:bg-gray-100 cursor-pointer";
    folderItem.dataset.id = folder.id;
    folderItem.dataset.name = folder.name;
    folderItem.innerHTML = `
      <div class="flex items-center">
        <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mr-3">
          <i class="fas fa-folder text-gray-500"></i>
        </div>
        <div class="flex-1">
          <div class="folder-name font-medium">${folder.name}</div>
          <div class="text-xs text-gray-500">${
            folder.isSubject ? "Subject" : "Course"
          }</div>
        </div>
      </div>
    `;
    folderItem.addEventListener("click", () =>
      selectFolder(folder.id, folder.name, folder.isSubject)
    );
    foldersList.appendChild(folderItem);
  });
}

// Select a folder and load its contents
async function selectFolder(folderId, folderName, isSubject) {
  currentFolderId = folderId;
  foldersList.querySelectorAll(".folder-item").forEach((item) => {
    item.classList.toggle("bg-gray-100", item.dataset.id === folderId);
  });
  welcomeMessage.classList.add("hidden");
  contentContainer.classList.remove("hidden");
  loadingContent.classList.remove("hidden");
  emptyFolderMessage.classList.add("hidden");
  contentList.innerHTML = "";
  try {
    if (isSubject) {
      currentSubject = folderName;
      subjectHeader.classList.remove("hidden");
      subjectName.textContent = folderName;
      await loadFiles(folderId);
    } else {
      subjectHeader.classList.add("hidden");
      await loadSubfolders(folderId);
    }
  } catch (error) {
    console.error("Error loading content:", error);
    showErrorMessage(contentList, "Failed to load content");
  } finally {
    loadingContent.classList.add("hidden");
  }
}

// Load subfolders for a course folder
async function loadSubfolders(folderId) {
  const subfolders = await fetchFolders(folderId);
  if (subfolders.length === 0) {
    emptyFolderMessage.classList.remove("hidden");
  } else {
    renderSubfolders(subfolders);
  }
}

// Render subfolders in the right pane
function renderSubfolders(subfolders) {
  contentList.innerHTML = "";
  subfolders.forEach((folder) => {
    const subfolderItem = document.createElement("div");
    subfolderItem.className =
      "subfolder-item bg-white rounded-lg p-3 mb-3 shadow cursor-pointer hover:bg-gray-50";
    subfolderItem.innerHTML = `
      <div class="flex items-center">
        <div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mr-3">
          <i class="fas fa-folder text-gray-500"></i>
        </div>
        <div class="flex-1">
          <div class="font-medium">${folder.name}</div>
          <div class="text-xs text-gray-500">Subject</div>
        </div>
        <i class="fas fa-chevron-right text-gray-400"></i>
      </div>
    `;
    subfolderItem.addEventListener("click", () =>
      selectFolder(folder.id, folder.name, true)
    );
    contentList.appendChild(subfolderItem);
  });
}

// Load files for a subject folder
async function loadFiles(folderId) {
  const files = await fetchFiles(folderId);
  if (files.length === 0) {
    emptyFolderMessage.classList.remove("hidden");
  } else {
    renderFiles(files);
  }
}

// Render files in a chat-like format
function renderFiles(files) {
  contentList.innerHTML = "";
  files.forEach((file) => {
    const chatBubble = document.createElement("div");
    chatBubble.className =
      "chat-bubble relative bg-white rounded-lg p-3 mb-3 shadow hover:bg-gray-50 cursor-pointer";
    const rollNumber = file.rollNumber || "Unknown";
    const fileId = file.fileId || "Unknown";
    const fileName = file.name;
    chatBubble.innerHTML = `
      <div class="flex items-start">
        <div class="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center mr-3 flex-shrink-0">
          ${rollNumber}
        </div>
        <div class="flex-1">
          <div class="text-sm font-semibold text-teal-700">${fileId}</div>
          <div class="break-words">${fileName}</div>
          <div class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</div>
        </div>
        <div class="download-icon hidden items-center justify-center ml-2 w-8 h-8 bg-gray-200 rounded-full hover:bg-gray-300">
          <i class="fas fa-download text-gray-600"></i>
        </div>
      </div>
    `;
    chatBubble.addEventListener("click", (e) => {
      if (e.target.closest(".download-icon")) {
        downloadFileFromGDrive(file.id, file.name);
      } else {
        openFilePreview(file);
      }
    });
    const downloadIcon = chatBubble.querySelector(".download-icon");
    downloadIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadFileFromGDrive(file.id, file.name);
    });
    contentList.appendChild(chatBubble);
  });
}

// Open file preview modal
async function openFilePreview(file) {
  currentFileId = file.id;
  previewFilename.textContent = file.name;
  previewModal.classList.remove("hidden");
  pdfContainer.classList.add("hidden");
  docxContainer.classList.add("hidden");
  docPreviewIframe.classList.add("hidden");
  previewError.classList.add("hidden");
  previewLoading.classList.remove("hidden");
  docPreviewIframe.src = ""; // Reset iframe src immediately to avoid showing previous content
  currentFileBlob = null; // Reset file blob

  const fileExtension = file.name.split(".").pop().toLowerCase();
  try {
    if (fileExtension === "pdf") {
      printButton.classList.add("hidden"); // Hide print button for PDFs
      await previewPdfFile(file);
    } else if (fileExtension === "doc" || fileExtension === "docx") {
      printButton.classList.remove("hidden"); // Show print button for DOC/DOCX
      await previewDocFile(file);
    } else {
      printButton.classList.remove("hidden"); // Default to showing print button for unsupported types
      showPreviewError("Unsupported file type");
    }
  } catch (error) {
    console.error("Error opening file preview:", error);
    showPreviewError("Error loading file");
  }
}

// Preview PDF file using data URI
async function previewPdfFile(file) {
  try {
    const fileContent = await fetchFileContent(file.id);
    if (!fileContent) throw new Error("Failed to fetch file content");
    currentFileBlob = `data:application/pdf;base64,${fileContent}`;
    docPreviewIframe.src = currentFileBlob;
    // Wait for the iframe to load before hiding the loading animation
    docPreviewIframe.addEventListener(
      "load",
      () => {
        previewLoading.classList.add("hidden");
        docPreviewIframe.classList.remove("hidden");
      },
      { once: true }
    );
  } catch (error) {
    console.error("Error previewing PDF:", error);
    showPreviewError("Error loading PDF");
  }
}

// Preview DOC/DOCX file using Google Docs preview
async function previewDocFile(file) {
  try {
    docPreviewIframe.src = `https://docs.google.com/document/d/${file.id}/preview?tab=t.0`;
    // Wait for the iframe to load before hiding the loading animation
    docPreviewIframe.addEventListener(
      "load",
      () => {
        previewLoading.classList.add("hidden");
        docPreviewIframe.classList.remove("hidden");
      },
      { once: true }
    );
  } catch (error) {
    console.error("Error previewing DOC file:", error);
    showPreviewError("Error loading document");
  }
}

// Show preview error
function showPreviewError(message) {
  previewLoading.classList.add("hidden");
  previewError.classList.remove("hidden");
  errorMessage.textContent = message || "Unable to preview file";
}

// Print the current file
async function printFile() {
  const fileExtension = previewFilename.textContent
    .split(".")
    .pop()
    .toLowerCase();
  if (fileExtension === "doc" || fileExtension === "docx") {
    if (!currentFileId) {
      console.error("Print failed: currentFileId is not set");
      alert("Please wait for the document to load before printing");
      return;
    }

    console.log(
      "Opening new tab for printing DOC/DOCX with fileId:",
      currentFileId
    );
    const printUrl = `https://docs.google.com/document/d/${currentFileId}/preview?tab=t.0`;
    console.log("Print URL:", printUrl);

    const printWindow = window.open(printUrl, "_blank");
    if (!printWindow) {
      console.error("Failed to open new tab: Pop-up blocked or browser issue");
      alert("Please allow pop-ups to print the document");
      return;
    }

    console.log("New tab opened successfully, waiting for load event...");
    printWindow.addEventListener(
      "load",
      () => {
        console.log("Print window loaded successfully");
        setTimeout(() => {
          try {
            console.log("Focusing print window...");
            printWindow.focus();
            console.log("Attempting to open print dialog...");
            printWindow.print();
            console.log("Print dialog triggered successfully");
            printWindow.close();
            console.log("Print window closed");
          } catch (e) {
            console.error("Error during print operation:", e);
            console.error("Error details:", {
              message: e.message,
              stack: e.stack,
              name: e.name,
            });
            alert(
              "Failed to print document. Please try printing manually from the preview."
            );
          }
        }, 2000); // Delay to ensure rendering
      },
      { once: true }
    );

    // Fallback: Check if the load event fails to fire
    setTimeout(() => {
      if (printWindow.document.readyState !== "complete") {
        console.error("Print window load event did not fire within 10 seconds");
        console.log(
          "Current document.readyState:",
          printWindow.document.readyState
        );
        alert(
          "Failed to load document for printing. Please try printing manually from the preview."
        );
        printWindow.close();
      }
    }, 10000); // 10-second timeout
  } else {
    console.warn("Printing not supported for file type:", fileExtension);
    alert("Printing is not supported for this file type");
  }
}

// Download the current file
function downloadFile() {
  if (currentFileId) {
    downloadFileFromGDrive(currentFileId, previewFilename.textContent);
  }
}

// Download a file from Google Drive
async function downloadFileFromGDrive(fileId, fileName) {
  try {
    const content = await fetchFileContent(fileId);
    if (!content) throw new Error("Failed to fetch file content");
    const byteCharacters = atob(content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const fileExtension = fileName.split(".").pop().toLowerCase();
    const mimeType =
      {
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }[fileExtension] || "application/octet-stream";
    const blob = new Blob([byteArray], { type: mimeType });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  } catch (error) {
    console.error("Error downloading file:", error);
    alert("Failed to download file. Please try again.");
  }
}

// Show error message in a container
function showErrorMessage(container, message) {
  container.innerHTML = `
    <div class="p-4 text-center">
      <i class="fas fa-exclamation-circle text-red-500 text-2xl mb-2"></i>
      <p class="text-gray-700">${message}</p>
    </div>
  `;
}

// API functions to communicate with Google Apps Script
async function fetchFolders(folderId) {
  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=getFolders&folderId=${folderId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.folders || [];
  } catch (error) {
    console.error("Error fetching folders:", error);
    throw error;
  }
}

async function fetchFiles(folderId) {
  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=getFiles&folderId=${folderId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.files || [];
  } catch (error) {
    console.error("Error fetching files:", error);
    throw error;
  }
}

async function fetchFileContent(fileId) {
  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=getFileContent&fileId=${fileId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.content;
  } catch (error) {
    console.error("Error fetching file content:", error);
    throw error;
  }
}

async function fetchTemporaryUrl(fileId) {
  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=getTemporaryUrl&fileId=${fileId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return { url: data.url, expires: data.expires };
  } catch (error) {
    console.error("Error fetching temporary URL:", error);
    throw error;
  }
}

async function revokeTemporaryAccess(fileId) {
  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=revokeTemporaryAccess&fileId=${fileId}`,
      { method: "POST" }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.success;
  } catch (error) {
    console.error("Error revoking temporary access:", error);
    throw error;
  }
}
