const ROOT_FOLDER_ID = '1xfnB19Nvk0am-REJr-q9wqLoTAU3S55N';

//doGet - Handle HTTP GET requests to the web app
function doGet(e) {
  try {
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    const action = e.parameter.action;
    let result = {};
    switch (action) {
      case 'getFolders':
        result = handleGetFolders(e.parameter.folderId);
        break;
      case 'getFiles':
        result = handleGetFiles(e.parameter.folderId);
        break;
      case 'getFileContent':
        result = handleGetFileContent(e.parameter.fileId);
        break;
      case 'getTemporaryUrl':
        result = handleGetTemporaryUrl(e.parameter.fileId);
        break;
      case 'revokeTemporaryAccess':
        result = handleRevokeTemporaryAccess(e.parameter.fileId);
        break;
      case 'ensureFileAccess':
        result = handleEnsureFileAccess(e.parameter.fileId);
        break;
      default:
        result = { error: 'Invalid action' };
    }
    output.setContent(JSON.stringify(result));
    return output;
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

//Handle the getFolders action
function handleGetFolders(folderId) {
  if (!folderId) throw new Error('Folder ID is required');
  const folder = DriveApp.getFolderById(folderId);
  if (!folder) throw new Error('Folder not found');
  const subfolders = folder.getFolders();
  const foldersArray = [];
  const isRootFolder = (folderId === ROOT_FOLDER_ID);
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    foldersArray.push({
      id: subfolder.getId(),
      name: subfolder.getName(),
      isSubject: !isRootFolder
    });
  }
  return { folders: foldersArray };
}

//Handle the getFiles action
function handleGetFiles(folderId) {
  if (!folderId) throw new Error('Folder ID is required');
  const folder = DriveApp.getFolderById(folderId);
  if (!folder) throw new Error('Folder not found');
  const files = folder.getFiles();
  const filesArray = [];
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const fileInfo = parseFileName(fileName);
    const mimeType = file.getMimeType();
    let fileType = mimeType === "application/pdf" ? "PDF" : (mimeType.includes("document") ? "DOC" : "Unknown");
    let pages = "Unknown";
    if (fileType === "DOC") {
      try {
        const doc = Docs.Documents.get(file.getId());
        pages = doc.body.content.length > 1 ? (doc.body.content.length - 1).toString() : "1"; // Rough page estimate
      } catch (e) {
        Logger.log(`Error getting page count for ${file.getId()}: ${e}`);
      }
    }
    const sizeBytes = file.getSize();
    let sizeFormatted;
    if (sizeBytes < 1024) {
      sizeFormatted = `${sizeBytes} Bytes`; // Below 1 KB
    } else if (sizeBytes < 1024 * 1024) {
      sizeFormatted = `${(sizeBytes / 1024).toFixed(2)} KB`; // Below 1 MB
    } else if (sizeBytes < 1024 * 1024 * 1024) {
      sizeFormatted = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`; // Below 1 GB
    } else {
      sizeFormatted = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`; // 1 GB or more
    }

    filesArray.push({
      id: file.getId(),
      name: fileName,
      mimeType: mimeType,
      size: sizeFormatted, // Formatted size with unit
      pages: pages, // Page count or "Unknown" for PDFs
      fileType: fileType, // PDF or DOC
      rollNumber: fileInfo.rollNumber,
      experimentNumber: fileInfo.experiment, // Extracted experiment number
      subject: fileInfo.subject,
      fileId: fileInfo.fileId,
      lastUpdated: file.getLastUpdated().getTime() // Timestamp in milliseconds
    });
  }
  return { files: filesArray };
}

//Handle the getFileContent action
function handleGetFileContent(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  const blob = file.getBlob();
  const base64Content = Utilities.base64Encode(blob.getBytes());
  return { content: base64Content };
}

//Handle the getTemporaryUrl action
function handleGetTemporaryUrl(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = file.getDownloadUrl();
  const expires = new Date(new Date().getTime() + 3600000); // 1 hour expiration
  PropertiesService.getScriptProperties().setProperty(fileId, JSON.stringify({ url, expires }));
  Logger.log(`Temporary URL generated for file ${fileId}: ${url}`);
  return { url, expires: expires.getTime() };
}

//Handle the revokeTemporaryAccess action
function handleRevokeTemporaryAccess(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  PropertiesService.getScriptProperties().deleteProperty(fileId);
  return { success: true };
}

//Handle the ensureFileAccess action
function handleEnsureFileAccess(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log(`Ensured access for file ${fileId} by setting sharing to ANYONE_WITH_LINK`);
  return { success: true };
}

/**
 * Parse a filename to extract information
 * Updated to match example: 34_EXP6_IAI [S3578].docx
 */
function parseFileName(fileName) {
  const fileInfo = { rollNumber: '', experiment: '', subject: '', fileId: '' };
  try {
    const pattern = /^(\d+)_([A-Za-z0-9_]+)\s*\[([A-Za-z0-9]+)\].*$/;
    const matches = fileName.match(pattern);
    if (matches && matches.length >= 4) {
      fileInfo.rollNumber = matches[1]; // "34"
      fileInfo.experiment = matches[2]; // "EXP6_IAI"
      fileInfo.fileId = matches[3]; // "S3578"
    }
  } catch (e) {
    Logger.log('Error parsing filename: ' + e);
  }
  return fileInfo;
}

//Clean up expired temporary URLs
function cleanupExpiredUrls() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const now = new Date().getTime();
  for (const [fileId, data] of Object.entries(properties)) {
    const { expires } = JSON.parse(data);
    if (now > expires) {
      try {
        const file = DriveApp.getFileById(fileId);
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        PropertiesService.getScriptProperties().deleteProperty(fileId);
        Logger.log(`Revoked temporary access for file ${fileId}`);
      } catch (e) {
        Logger.log('Error cleaning up file ' + fileId + ': ' + e);
      }
    }
  }
}
