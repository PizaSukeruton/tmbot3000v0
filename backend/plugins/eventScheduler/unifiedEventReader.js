const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse');

class UnifiedEventReader {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', '..', 'data');
  }

  async getAllEvents() {
    try {
      const csvFiles = await this.findCSVFiles();
      const dateContainingFiles = await this.findDateContainingCSVs(csvFiles);
      const allEvents = [];

      for (const fileInfo of dateContainingFiles) {
        const events = await this.extractEventsFromCSV(fileInfo);
        allEvents.push(...events);
      }

      return this.sortEventsByDate(allEvents);
    } catch (error) {
      console.error('Error reading unified events:', error);
      return [];
    }
  }

  async findCSVFiles() {
    const files = await fs.readdir(this.dataDir);
    return files.filter(file => file.endsWith('.csv'));
  }

  async findDateContainingCSVs(csvFiles) {
    const dateContainingFiles = [];

    for (const file of csvFiles) {
      const filePath = path.join(this.dataDir, file);
      const dateColumns = await this.detectDateColumns(filePath);

      if (dateColumns.length > 0) {
        dateContainingFiles.push({
          file,
          path: filePath,
          dateColumns
        });
      }
    }

    return dateContainingFiles;
  }

  async detectDateColumns(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) return [];
      
      const headers = lines[0].split(',').map(header => header.trim());
      const firstDataRow = lines[1].split(',').map(cell => cell.trim());
      
      const dateColumns = [];
      
      for (let i = 0; i < headers.length; i++) {
        if (firstDataRow[i] && this.isDateValue(firstDataRow[i])) {
          dateColumns.push(headers[i]);
        }
      }
      
      return dateColumns;
    } catch (error) {
      return [];
    }
  }

  isDateValue(value) {
    if (!value || typeof value !== 'string') return false;
    
    try {
      const date = new Date(value.trim());
      return !isNaN(date.getTime()) && value.trim().length > 8;
    } catch (error) {
      return false;
    }
  }

  async extractEventsFromCSV(fileInfo) {
    try {
      const fileContent = await fs.readFile(fileInfo.path, 'utf-8');
      
      const rows = await new Promise((resolve, reject) => {
        const results = [];
        const parser = parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        });
        
        parser.on('data', (row) => {
          results.push(row);
        });
        
        parser.on('end', () => {
          resolve(results);
        });
        
        parser.on('error', (error) => {
          reject(error);
        });
      });

      const events = [];
      for (const row of rows) {
        for (const dateColumn of fileInfo.dateColumns) {
          if (row[dateColumn] && row[dateColumn].trim()) {
            events.push(this.createUnifiedEvent(row, dateColumn, fileInfo.file));
          }
        }
      }

      return events;
    } catch (error) {
      console.error(`Error processing ${fileInfo.file}:`, error);
      return [];
    }
  }

  createUnifiedEvent(row, dateColumn, sourceFile) {
    const date = this.parseDate(row[dateColumn]);
    
    
    return {
      event_id: row.event_id || `EVT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateTitle(row, sourceFile),
      date: date,
      time: this.extractTime(row),
      source: sourceFile
    };
  }

  extractTime(row) {
    const columns = Object.keys(row);
    
    for (const column of columns) {
      if (row[column] && typeof row[column] === 'string') {
        const timeMatch = row[column].match(/^\d{1,2}:\d{2}/);
        if (timeMatch) {
          return row[column];
        }
      }
    }
    
    return '';
  }

  generateTitle(row, sourceFile) {
    const columns = Object.keys(row);
    
    for (const column of columns) {
      if (row[column] && row[column].trim() && 
          column.toLowerCase().includes('title')) {
        return row[column];
      }
    }
    
    for (const column of columns) {
      if (row[column] && row[column].trim() && 
          column.toLowerCase().includes('description')) {
        return row[column];
      }
    }
    
    for (const column of columns) {
      if (row[column] && row[column].trim() && 
          column.toLowerCase().includes('name')) {
        return row[column];
      }
    }
    
    return sourceFile.replace('.csv', '').replace('_', ' ');
  }

  parseDate(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      
      return date.toISOString().split('T')[0];
    } catch (error) {
      return null;
    }
  }

  sortEventsByDate(events) {
    return events.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  }
}

module.exports = UnifiedEventReader;
