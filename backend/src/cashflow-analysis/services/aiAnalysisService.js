// src/cashflow-analysis/services/aiAnalysisService.js
const axios = require('axios');
const moment = require('moment');

class AIAnalysisService {
  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    // Use the same Gemini model endpoint used elsewhere in the codebase
    // (gemini-2.5-flash) to avoid 404s for unavailable/older model names.
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    
    if (!this.geminiApiKey) {
      console.warn('⚠️  GEMINI_API_KEY not found in environment variables');
    } else {
      console.log('✅ Gemini API key configured');
    }
  }

  /**
   * Analyze cashflow data using Gemini AI
   * @param {Object} cashflowData - The cashflow data to analyze
   * @returns {Object} Analysis results
   */
  async analyzeCashflow(cashflowData) {
    try {
      if (!this.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      console.log('🔨 Building analysis prompt...');
      const prompt = this.buildAnalysisPrompt(cashflowData);
      console.log('📏 Prompt length:', prompt.length, 'characters');
      
      if (prompt.length > 30000) {
        console.warn('⚠️  Prompt is very long, this might cause issues');
      }
      
      const analysisResult = await this.callGeminiAPI(prompt);
      
      if (!analysisResult.success) {
        return analysisResult;
      }

      // Parse and structure the AI response
      console.log('🔍 Parsing AI response...');
      const structuredAnalysis = this.parseAIResponse(analysisResult.response, cashflowData);
      
      return {
        success: true,
        analysis: structuredAnalysis,
        rawResponse: analysisResult.response
      };

    } catch (error) {
      console.error('AI Analysis error:', error.message);
      return {
        success: false,
        error: 'Failed to analyze cashflow data',
        details: error.message
      };
    }
  }

  /**
   * Build comprehensive analysis prompt for Gemini
   * @private
   */
  buildAnalysisPrompt(cashflowData) {
    const { entries, summary, reportPeriod, businessName } = cashflowData;
    
    // Calculate additional metrics
    const metrics = this.calculateBusinessMetrics(entries);
    const trends = this.analyzeTrends(entries);
    
    const prompt = `
You are a senior business financial analyst. Analyze the following cashflow data and provide comprehensive business insights in a structured JSON format.

BUSINESS INFORMATION:
- Business Name: ${businessName || 'Unknown Business'}
- Analysis Period: ${moment(reportPeriod.startDate).format('YYYY-MM-DD')} to ${moment(reportPeriod.endDate).format('YYYY-MM-DD')}
- Total Entries: ${entries.length}

FINANCIAL SUMMARY:
- Total Revenue: $${summary.totalRevenue.toLocaleString()}
- Total Expenses: $${summary.totalExpenses.toLocaleString()}
- Net Cashflow: $${summary.netCashflow.toLocaleString()}
- Gross Profit Margin: ${metrics.grossProfitMargin.toFixed(2)}%

DETAILED CASHFLOW DATA:
${this.formatEntriesForAnalysis(entries.slice(0, 20))} // Reduced to 20 entries for prompt size

EXPENSE BREAKDOWN:
${this.formatExpenseBreakdown(entries)}

REVENUE BREAKDOWN:
${this.formatRevenueBreakdown(entries)}

MONTHLY TRENDS:
${this.formatTrendsForAnalysis(trends)}

Please provide a comprehensive analysis in the following JSON structure:

{
  "executiveSummary": "3-4 sentence executive summary of business financial health",
  "overallHealthScore": 0-100 (integer score of overall financial health),
  "insights": [
    {
      "type": "profitability|liquidity|trend_analysis|expense_breakdown|revenue_analysis|seasonal_patterns|risk_assessment|growth_potential|cost_optimization|forecasting",
      "title": "Insight title",
      "description": "Detailed description of the insight",
      "severity": "low|medium|high|critical",
      "actionable": true/false,
      "recommendation": "Specific recommendation if actionable",
      "impact": "positive|negative|neutral",
      "confidence": 0-100
    }
  ],
  "keyMetrics": [
    {
      "name": "Metric name",
      "value": numerical_value,
      "unit": "currency|percentage|count|ratio",
      "trend": "up|down|stable",
      "changePercentage": percentage_change,
      "description": "What this metric means"
    }
  ],
  "recommendations": [
    {
      "priority": "low|medium|high|urgent",
      "category": "cost_reduction|revenue_growth|cash_management|risk_mitigation|operational_efficiency",
      "title": "Recommendation title",
      "description": "Detailed recommendation",
      "expectedImpact": "Expected business impact",
      "timeframe": "immediate|short_term|medium_term|long_term"
    }
  ],
  "riskFactors": [
    {
      "type": "cashflow|operational|market|financial",
      "description": "Risk description",
      "likelihood": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "visualizationSuggestions": [
    {
      "chartType": "pie|bar|line|area|donut",
      "title": "Chart title",
      "description": "What this chart should show",
      "category": "revenue|expenses|trends|comparisons|forecasts",
      "dataPoints": ["list", "of", "data", "points", "to", "include"]
    }
  ]
}

CRITICAL RESPONSE FORMAT REQUIREMENTS:
- MUST return ONLY valid JSON in the exact format specified above
- ALL array fields (insights, keyMetrics, recommendations, riskFactors, visualizationSuggestions) MUST be present, even if empty []
- NO additional text, comments, or markdown formatting outside the JSON
- ALL required fields must be present with correct data types
- String fields cannot be null or undefined - use empty string "" if no value
- Number fields must be valid numbers, not strings
- Boolean fields must be true or false, not strings

ANALYSIS REQUIREMENTS:
1. Focus on actionable insights that can drive business decisions
2. Identify specific patterns in revenue and expense timing
3. Highlight any concerning trends or positive opportunities
4. Provide industry-relevant benchmarks where possible
5. Consider seasonal patterns and business cycles
6. Assess liquidity and working capital management
7. Identify cost optimization opportunities
8. Evaluate revenue diversification and growth potential
9. Flag any unusual transactions or patterns
10. Provide forward-looking recommendations

Ensure all numerical values are realistic and based on the provided data. Be specific and avoid generic advice.`;

    return prompt;
  }

  /**
   * Calculate business metrics from entries
   * @private
   */
  calculateBusinessMetrics(entries) {
    const revenue = entries.filter(e => e.category === 'revenue');
    const expenses = entries.filter(e => e.category === 'expense');
    
    const totalRevenue = revenue.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);
    
    return {
      grossProfitMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
      expenseRatio: totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0,
      averageTransactionSize: entries.length > 0 ? totalRevenue / revenue.length : 0,
      transactionFrequency: entries.length
    };
  }

  /**
   * Analyze trends in the data
   * @private
   */
  analyzeTrends(entries) {
    const monthlyData = {};
    
    entries.forEach(entry => {
      const month = moment(entry.date).format('YYYY-MM');
      if (!monthlyData[month]) {
        monthlyData[month] = { revenue: 0, expenses: 0, count: 0 };
      }
      
      if (entry.category === 'revenue') {
        monthlyData[month].revenue += entry.amount;
      } else if (entry.category === 'expense') {
        monthlyData[month].expenses += Math.abs(entry.amount);
      }
      monthlyData[month].count++;
    });
    
    return monthlyData;
  }

  /**
   * Format entries for analysis prompt
   * @private
   */
  formatEntriesForAnalysis(entries) {
    return entries.map(entry => 
      `${moment(entry.date).format('YYYY-MM-DD')}: ${entry.category.toUpperCase()} - $${entry.amount} - ${entry.description}`
    ).join('\n');
  }

  /**
   * Format expense breakdown
   * @private
   */
  formatExpenseBreakdown(entries) {
    const expenses = entries.filter(e => e.category === 'expense');
    const breakdown = {};
    
    expenses.forEach(expense => {
      const category = expense.subcategory || 'Other';
      breakdown[category] = (breakdown[category] || 0) + Math.abs(expense.amount);
    });
    
    return Object.entries(breakdown)
      .sort(([,a], [,b]) => b - a)
      .map(([category, amount]) => `${category}: $${amount.toLocaleString()}`)
      .join('\n');
  }

  /**
   * Format revenue breakdown
   * @private
   */
  formatRevenueBreakdown(entries) {
    const revenue = entries.filter(e => e.category === 'revenue');
    const breakdown = {};
    
    revenue.forEach(rev => {
      const category = rev.subcategory || 'Other';
      breakdown[category] = (breakdown[category] || 0) + rev.amount;
    });
    
    return Object.entries(breakdown)
      .sort(([,a], [,b]) => b - a)
      .map(([category, amount]) => `${category}: $${amount.toLocaleString()}`)
      .join('\n');
  }

  /**
   * Format trends for analysis
   * @private
   */
  formatTrendsForAnalysis(trends) {
    return Object.entries(trends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => 
        `${month}: Revenue $${data.revenue.toLocaleString()}, Expenses $${data.expenses.toLocaleString()}, Net $${(data.revenue - data.expenses).toLocaleString()}`
      )
      .join('\n');
  }

  /**
   * Call Gemini API
   * @private
   */
  async callGeminiAPI(prompt) {
    try {
      console.log('🚀 Making Gemini API call...');
      const response = await axios.post(this.baseUrl, {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for more focused analysis
          maxOutputTokens: 8192, // Increased to model's maximum
          topP: 0.8,
          topK: 40,
          response_mime_type: "application/json" // Enforce JSON output
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          key: this.geminiApiKey
        },
        timeout: 60000 // 60 second timeout for complex analysis
      });

      console.log('📡 Gemini API response status:', response.status);
      console.log('📝 Response structure:', JSON.stringify(response.data, null, 2));

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log('✅ Gemini API call successful');
        return {
          success: true,
          response: response.data.candidates[0].content.parts[0].text
        };
      }

      console.log('❌ Invalid response structure from Gemini API — will attempt local fallback');
      // Return success with the raw response so the caller can attempt to parse
      // and fall back to a local analysis if parsing fails. This prevents the
      // whole analysis flow from failing when the model returns an unexpected
      // structure (e.g., MAX_TOKENS with no content parts).
      return {
        success: true,
        response: JSON.stringify(response.data)
      };

    } catch (error) {
      console.error('Gemini API call error:', error.message);
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.response.statusText;
        
        if (status === 401) {
          return { success: false, error: 'Invalid Gemini API key' };
        } else if (status === 429) {
          return { success: false, error: 'Rate limit exceeded, please try again later' };
        } else if (status === 400) {
          return { success: false, error: `Invalid request: ${message}` };
        }
      }
      
      return {
        success: false,
        error: 'Failed to connect to Gemini API',
        details: error.message
      };
    }
  }

  /**
   * Parse and structure AI response
   * @private
   */
  parseAIResponse(responseText, cashflowData) {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsedResponse.executiveSummary || !parsedResponse.overallHealthScore) {
        throw new Error('Missing required fields in AI response');
      }

      // Add visualization data based on cashflow data
      const visualizations = this.generateVisualizationData(cashflowData, parsedResponse.visualizationSuggestions);
      
      return {
        executiveSummary: parsedResponse.executiveSummary,
        overallHealthScore: Math.max(0, Math.min(100, parsedResponse.overallHealthScore)),
        insights: parsedResponse.insights || [],
        keyMetrics: parsedResponse.keyMetrics || [],
        recommendations: parsedResponse.recommendations || [],
        riskFactors: parsedResponse.riskFactors || [],
        visualizations: visualizations
      };

    } catch (error) {
      console.error('Error parsing AI response:', error.message);
      
      // Return a basic analysis if parsing fails
      return this.generateFallbackAnalysis(cashflowData);
    }
  }

  /**
   * Generate visualization data for React charts
   * @private
   */
  generateVisualizationData(cashflowData, suggestions = []) {
    const visualizations = [];
    const { entries } = cashflowData;

    // Expense breakdown pie chart
    const expenseData = this.generateExpenseBreakdownData(entries);
    if (expenseData.datasets && expenseData.datasets[0] && expenseData.datasets[0].data.length > 0) {
      visualizations.push({
        chartType: 'pie',
        title: 'Expense Breakdown',
        category: 'expenses',
        data: expenseData
      });
    }

    // Revenue vs Expenses bar chart
    const revenueExpenseData = this.generateRevenueExpenseData(entries);
    visualizations.push({
      chartType: 'bar',
      title: 'Revenue vs Expenses by Month',
      category: 'comparisons',
      data: revenueExpenseData
    });

    // Cashflow trend line chart
    const trendData = this.generateCashflowTrendData(entries);
    visualizations.push({
      chartType: 'line',
      title: 'Net Cashflow Trend',
      category: 'trends',
      data: trendData
    });

    return visualizations;
  }

  /**
   * Generate expense breakdown data for pie chart
   * @private
   */
  generateExpenseBreakdownData(entries) {
    const expenses = entries.filter(e => e.category === 'expense');
    const breakdown = {};
    
    expenses.forEach(expense => {
      const category = expense.subcategory || 'Other Expenses';
      breakdown[category] = (breakdown[category] || 0) + Math.abs(expense.amount);
    });
    
    return {
      labels: Object.keys(breakdown),
      datasets: [{
        data: Object.values(breakdown),
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
          '#9966FF', '#FF9F40', '#E7E9ED', '#71B37C'
        ]
      }]
    };
  }

  /**
   * Generate revenue vs expenses data
   * @private
   */
  generateRevenueExpenseData(entries) {
    const monthlyData = {};
    
    entries.forEach(entry => {
      const month = moment(entry.date).format('MMM YYYY');
      if (!monthlyData[month]) {
        monthlyData[month] = { revenue: 0, expenses: 0 };
      }
      
      if (entry.category === 'revenue') {
        monthlyData[month].revenue += entry.amount;
      } else if (entry.category === 'expense') {
        monthlyData[month].expenses += Math.abs(entry.amount);
      }
    });
    
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => 
      moment(a, 'MMM YYYY').valueOf() - moment(b, 'MMM YYYY').valueOf()
    );
    
    return {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Revenue',
          data: sortedMonths.map(month => monthlyData[month].revenue),
          backgroundColor: '#36A2EB'
        },
        {
          label: 'Expenses',
          data: sortedMonths.map(month => monthlyData[month].expenses),
          backgroundColor: '#FF6384'
        }
      ]
    };
  }

  /**
   * Generate cashflow trend data
   * @private
   */
  generateCashflowTrendData(entries) {
    const monthlyData = {};
    
    entries.forEach(entry => {
      const month = moment(entry.date).format('MMM YYYY');
      if (!monthlyData[month]) {
        monthlyData[month] = 0;
      }
      
      if (entry.category === 'revenue') {
        monthlyData[month] += entry.amount;
      } else if (entry.category === 'expense') {
        monthlyData[month] -= Math.abs(entry.amount);
      }
    });
    
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => 
      moment(a, 'MMM YYYY').valueOf() - moment(b, 'MMM YYYY').valueOf()
    );
    
    return {
      labels: sortedMonths,
      datasets: [{
        label: 'Net Cashflow',
        data: sortedMonths.map(month => monthlyData[month]),
        borderColor: '#4BC0C0',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true
      }]
    };
  }

  /**
   * Generate fallback analysis if AI parsing fails
   * @private
   */
  generateFallbackAnalysis(cashflowData) {
    const { summary } = cashflowData;
    
    return {
      executiveSummary: `Basic financial analysis: Total revenue of $${summary.totalRevenue.toLocaleString()}, expenses of $${summary.totalExpenses.toLocaleString()}, resulting in net cashflow of $${summary.netCashflow.toLocaleString()}.`,
      overallHealthScore: summary.netCashflow > 0 ? 70 : 40,
      insights: [{
        type: 'profitability',
        title: 'Basic Profitability Analysis',
        description: summary.netCashflow > 0 ? 'Business shows positive cashflow' : 'Business shows negative cashflow',
        severity: summary.netCashflow > 0 ? 'low' : 'high',
        actionable: summary.netCashflow <= 0,
        impact: summary.netCashflow > 0 ? 'positive' : 'negative',
        confidence: 60
      }],
      keyMetrics: [{
        name: 'Net Cashflow',
        value: summary.netCashflow,
        unit: 'currency',
        trend: 'stable',
        description: 'Total revenue minus total expenses'
      }],
      recommendations: [],
      riskFactors: [],
      visualizations: this.generateVisualizationData(cashflowData)
    };
  }
}

module.exports = AIAnalysisService;