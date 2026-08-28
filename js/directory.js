/**
 * Student & Staff Directory Management (Admin Panel)
 * Allows adding new student/staff records, editing existing rows, and searching.
 */

class DirectoryManager {
  constructor() {
    this.init();
  }

  init() {
    // Directory loaded from state
  }

  getAllRecords() {
    return window.state.getDirectory();
  }

  getRecordById(id) {
    const records = this.getAllRecords();
    return records.find(r => r.id === id) || null;
  }

  addRecord(recordData) {
    const records = this.getAllRecords();
    if (records.some(r => r.id.toLowerCase() === recordData.id.toLowerCase())) {
      throw new Error(`Record with ID ${recordData.id} already exists.`);
    }

    const newRecord = {
      id: recordData.id.trim().toUpperCase(),
      name: recordData.name.trim(),
      role: recordData.role || 'Student',
      department: recordData.department.trim(),
      phone: recordData.phone.trim()
    };

    records.unshift(newRecord);
    window.state.saveDirectory(records);
    window.state.addAuditLog(`Added new ${newRecord.role} record: ${newRecord.name} (${newRecord.id})`);
    return newRecord;
  }

  updateRecord(id, updateData) {
    const records = this.getAllRecords();
    const index = records.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Record not found');

    records[index] = {
      ...records[index],
      ...updateData,
      id: records[index].id // preserve ID
    };

    window.state.saveDirectory(records);
    window.state.addAuditLog(`Updated directory record: ${id}`);
    return records[index];
  }

  deleteRecord(id) {
    let records = this.getAllRecords();
    const record = records.find(r => r.id === id);
    if (!record) return false;

    records = records.filter(r => r.id !== id);
    window.state.saveDirectory(records);
    window.state.addAuditLog(`Deleted directory record: ${id} (${record.name})`);
    return true;
  }

  filterRecords(query = '', roleFilter = 'all') {
    let records = this.getAllRecords();
    const q = query.toLowerCase().trim();

    if (roleFilter !== 'all') {
      records = records.filter(r => r.role.toLowerCase() === roleFilter.toLowerCase());
    }

    if (q) {
      records = records.filter(r => 
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q)
      );
    }

    return records;
  }
}

window.directoryManager = new DirectoryManager();
