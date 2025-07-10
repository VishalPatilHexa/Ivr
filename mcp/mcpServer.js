class MCPServer {
  constructor() {
    this.tools = new Map();
    this.resources = new Map();
    this.conversations = new Map();
    this.patientData = new Map();
    this.conversationSummaries = new Map();
    this.registerDefaultTools();
  }

  registerDefaultTools() {
    // Patient data management
    this.registerTool('save_patient_data', {
      description: 'Save complete patient information',
      parameters: {
        sessionId: { type: 'string', description: 'Session identifier' },
        patientData: { type: 'object', description: 'Patient information object' },
        completedAt: { type: 'string', description: 'Completion timestamp' },
        status: { type: 'string', description: 'Conversation status' }
      },
      handler: async (params) => {
        const { sessionId, patientData, completedAt, status } = params;
        
        const record = {
          sessionId,
          patientData,
          completedAt,
          status,
          createdAt: new Date()
        };

        this.patientData.set(sessionId, record);
        console.log('✅ Patient data saved:', sessionId, patientData);
        
        return {
          success: true,
          message: 'Patient data saved successfully',
          sessionId,
          dataId: sessionId
        };
      }
    });

    // Individual patient response saving
    this.registerTool('save_patient_response', {
      description: 'Save individual patient response',
      parameters: {
        sessionId: { type: 'string', description: 'Session identifier' },
        field: { type: 'string', description: 'Data field name' },
        value: { type: 'string', description: 'Response value' },
        timestamp: { type: 'string', description: 'Response timestamp' }
      },
      handler: async (params) => {
        const { sessionId, field, value, timestamp } = params;
        
        if (!this.conversations.has(sessionId)) {
          this.conversations.set(sessionId, {
            sessionId,
            responses: new Map(),
            startedAt: new Date()
          });
        }

        const conversation = this.conversations.get(sessionId);
        conversation.responses.set(field, {
          value,
          timestamp: new Date(timestamp)
        });

        console.log(`📝 Response saved - ${field}: ${value}`);
        
        return {
          success: true,
          message: 'Response saved successfully',
          sessionId,
          field,
          value
        };
      }
    });

    // Conversation summary management
    this.registerTool('save_conversation_summary', {
      description: 'Save conversation summary',
      parameters: {
        sessionId: { type: 'string', description: 'Session identifier' },
        summary: { type: 'string', description: 'Conversation summary' },
        timestamp: { type: 'string', description: 'Summary timestamp' }
      },
      handler: async (params) => {
        const { sessionId, summary, timestamp } = params;
        
        this.conversationSummaries.set(sessionId, {
          sessionId,
          summary,
          timestamp: new Date(timestamp)
        });

        console.log('📄 Conversation summary saved:', sessionId);
        
        return {
          success: true,
          message: 'Summary saved successfully',
          sessionId
        };
      }
    });

    // Data validation tool
    this.registerTool('validate_patient_data', {
      description: 'Validate patient data completeness and format',
      parameters: {
        patientData: { type: 'object', description: 'Patient data to validate' }
      },
      handler: async (params) => {
        const { patientData } = params;
        const requiredFields = ['patientName', 'age', 'gender', 'healthIssue', 'duration', 'severity', 'city'];
        
        const validation = {
          isValid: true,
          missingFields: [],
          invalidFields: [],
          warnings: []
        };

        // Check required fields
        requiredFields.forEach(field => {
          if (!patientData[field] || patientData[field].trim() === '') {
            validation.missingFields.push(field);
            validation.isValid = false;
          }
        });

        // Validate specific fields
        if (patientData.age && (isNaN(patientData.age) || patientData.age < 0 || patientData.age > 120)) {
          validation.invalidFields.push('age');
          validation.isValid = false;
        }

        if (patientData.severity && (isNaN(patientData.severity) || patientData.severity < 1 || patientData.severity > 10)) {
          validation.invalidFields.push('severity');
          validation.isValid = false;
        }

        if (patientData.gender && !['पुरुष', 'महिला', 'male', 'female'].includes(patientData.gender.toLowerCase())) {
          validation.warnings.push('gender_format');
        }

        return validation;
      }
    });

    // Analytics tool
    this.registerTool('get_conversation_analytics', {
      description: 'Get analytics for conversations',
      parameters: {
        timeRange: { type: 'string', description: 'Time range (today, week, month)' }
      },
      handler: async (params) => {
        const { timeRange } = params;
        
        const analytics = {
          totalConversations: this.patientData.size,
          completedConversations: 0,
          averageCompletionTime: 0,
          commonHealthIssues: {},
          citiesDistribution: {},
          ageGroups: {
            '0-18': 0,
            '19-35': 0,
            '36-50': 0,
            '51-65': 0,
            '65+': 0
          }
        };

        // Calculate analytics from stored data
        this.patientData.forEach(record => {
          if (record.status === 'completed') {
            analytics.completedConversations++;
            
            const data = record.patientData;
            
            // Health issues distribution
            if (data.healthIssue) {
              analytics.commonHealthIssues[data.healthIssue] = 
                (analytics.commonHealthIssues[data.healthIssue] || 0) + 1;
            }

            // Cities distribution
            if (data.city) {
              analytics.citiesDistribution[data.city] = 
                (analytics.citiesDistribution[data.city] || 0) + 1;
            }

            // Age groups
            if (data.age) {
              const age = parseInt(data.age);
              if (age <= 18) analytics.ageGroups['0-18']++;
              else if (age <= 35) analytics.ageGroups['19-35']++;
              else if (age <= 50) analytics.ageGroups['36-50']++;
              else if (age <= 65) analytics.ageGroups['51-65']++;
              else analytics.ageGroups['65+']++;
            }
          }
        });

        return analytics;
      }
    });

    // Data export tool
    this.registerTool('export_patient_data', {
      description: 'Export patient data in specified format',
      parameters: {
        format: { type: 'string', description: 'Export format (json, csv)' },
        sessionIds: { type: 'array', description: 'Specific session IDs to export (optional)' }
      },
      handler: async (params) => {
        const { format, sessionIds } = params;
        
        let dataToExport = [];
        
        if (sessionIds && sessionIds.length > 0) {
          sessionIds.forEach(sessionId => {
            const record = this.patientData.get(sessionId);
            if (record) dataToExport.push(record);
          });
        } else {
          dataToExport = Array.from(this.patientData.values());
        }

        if (format === 'csv') {
          // Convert to CSV format
          const csvHeader = 'SessionId,PatientName,Age,Gender,HealthIssue,Duration,Severity,City,CompletedAt,Status\n';
          const csvRows = dataToExport.map(record => {
            const data = record.patientData;
            return [
              record.sessionId,
              data.patientName || '',
              data.age || '',
              data.gender || '',
              data.healthIssue || '',
              data.duration || '',
              data.severity || '',
              data.city || '',
              record.completedAt || '',
              record.status || ''
            ].join(',');
          }).join('\n');
          
          return {
            format: 'csv',
            data: csvHeader + csvRows,
            count: dataToExport.length
          };
        } else {
          // Return JSON format
          return {
            format: 'json',
            data: dataToExport,
            count: dataToExport.length
          };
        }
      }
    });
  }

  registerTool(name, tool) {
    this.tools.set(name, tool);
  }

  registerResource(name, resource) {
    this.resources.set(name, resource);
  }

  async executeTool(name, params) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return await tool.handler(params);
  }
}

module.exports = { MCPServer };