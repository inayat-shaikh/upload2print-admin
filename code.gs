/**
 * Google Apps Script backend for the Drive WhatsApp Viewer
 * This script handles all interactions with Google Drive
 */

const ROOT_FOLDER_ID = '1xfnB19Nvk0am-REJr-q9wqLoTAU3S55N';

/**
 * doGet - Handle HTTP GET requests to the web app
 */
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

/**
 * Handle the getFolders action
 */
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

/**
 * Handle the getFiles action
 */
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
    filesArray.push({
      id: file.getId(),
      name: fileName,
      mimeType: file.getMimeType(),
      size: file.getSize(),
      rollNumber: fileInfo.rollNumber,
      experiment: fileInfo.experiment,
      subject: fileInfo.subject,
      fileId: fileInfo.fileId
    });
  }
  return { files: filesArray };
}

/**
 * Handle the getFileContent action
 */
function handleGetFileContent(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  const blob = file.getBlob();
  const base64Content = Utilities.base64Encode(blob.getBytes());
  return { content: base64Content };
}

/**
 * Handle the getTemporaryUrl action
 */
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

/**
 * Handle the revokeTemporaryAccess action
 */
function handleRevokeTemporaryAccess(fileId) {
  if (!fileId) throw new Error('File ID is required');
  const file = DriveApp.getFileById(fileId);
  if (!file) throw new Error('File not found');
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  PropertiesService.getScriptProperties().deleteProperty(fileId);
  return { success: true };
}

/**
 * Parse a filename to extract information
 */
function parseFileName(fileName) {
  const fileInfo = { rollNumber: '', experiment: '', subject: '', fileId: '' };
  try {
    const pattern = /^(\d+)_([A-Za-z0-9]+)_([A-Za-z0-9]+)\s*\[([A-Za-z0-9]+)\].*$/;
    const matches = fileName.match(pattern);
    if (matches && matches.length >= 5) {
      fileInfo.rollNumber = matches[1];
      fileInfo.experiment = matches[2];
      fileInfo.subject = matches[3];
      fileInfo.fileId = matches[4];
    }
  } catch (e) {
    Logger.log('Error parsing filename: ' + e);
  }
  return fileInfo;
}

/**
 * Clean up expired temporary URLs
 * Run via a time-driven trigger (e.g., hourly)
 */
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
