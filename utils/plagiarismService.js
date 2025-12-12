const axios = require('axios');

/**
 * Plagiarism Detection Service
 * This service handles plagiarism checking for manuscripts
 * Currently implements a mock service - can be integrated with real services like:
 * - Turnitin API
 * - iThenticate API
 * - Copyleaks API
 * - Custom similarity detection algorithms
 */

class PlagiarismService {
  constructor() {
    this.threshold = {
      low: 15,      // 0-15% similarity
      medium: 30,   // 16-30% similarity
      high: 100     // 31%+ similarity
    };
  }

  /**
   * Check plagiarism for a manuscript
   * @param {string} manuscriptId - ID of the manuscript
   * @param {string} title - Title of the manuscript
   * @param {string} abstract - Abstract content
   * @param {string} content - Full manuscript content
   * @param {string} keywords - Keywords array
   * @returns {Object} Plagiarism report
   */
  async checkPlagiarism(manuscriptId, title, abstract, content, keywords = []) {
    try {
      console.log(`🔍 PLAGIARISM: Starting check for manuscript ${manuscriptId}`);
      
      // Simulate processing time (real services take 2-10 minutes)
      await this.simulateProcessing();

      // Mock plagiarism check results
      // In production, this would call external APIs or run similarity algorithms
      const mockResults = this.generateMockResults(title, abstract, content);

      const report = {
        manuscriptId,
        scanDate: new Date(),
        overallSimilarity: mockResults.similarity,
        status: this.getSimilarityStatus(mockResults.similarity),
        sources: mockResults.sources,
        details: {
          titleSimilarity: mockResults.titleSimilarity,
          abstractSimilarity: mockResults.abstractSimilarity,
          contentSimilarity: mockResults.contentSimilarity,
          wordCount: content ? content.split(' ').length : 0,
          excludedSources: mockResults.excludedSources
        },
        recommendations: this.getRecommendations(mockResults.similarity),
        scanEngine: 'NigJournal Plagiarism Detector v1.0',
        processingTime: mockResults.processingTime
      };

      console.log(`✅ PLAGIARISM: Check completed - ${report.overallSimilarity}% similarity (${report.status})`);
      
      return {
        success: true,
        report
      };

    } catch (error) {
      console.error('❌ PLAGIARISM: Check failed:', error);
      return {
        success: false,
        error: error.message,
        report: null
      };
    }
  }

  /**
   * Simulate processing time for plagiarism check
   */
  async simulateProcessing() {
    // Simulate 2-5 seconds processing time
    const processingTime = Math.random() * 3000 + 2000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
  }

  /**
   * Generate mock plagiarism results with text highlighting
   * In production, this would be replaced with actual API calls
   */
  generateMockResults(title, abstract, content) {
    // Generate realistic similarity percentages
    const baseSimilarity = Math.random() * 40; // 0-40%
    const titleSimilarity = Math.random() * 20; // 0-20%
    const abstractSimilarity = Math.random() * 25; // 0-25%
    const contentSimilarity = baseSimilarity;

    // Generate mock text matches with highlighting
    const textMatches = this.generateMockTextMatches(title, abstract, content);

    // Generate mock sources that might match
    const possibleSources = [
      {
        title: 'Similar Research in Academic Database',
        url: 'https://pubmed.ncbi.nlm.nih.gov/sample123',
        similarity: Math.random() * 15 + 5,
        matchType: 'partial',
        location: 'abstract',
        color: '#ff6b6b', // Red for high similarity
        matches: textMatches.abstract
      },
      {
        title: 'Previous Publication in Related Field',
        url: 'https://scholar.google.com/sample456',
        similarity: Math.random() * 10 + 3,
        matchType: 'phrase',
        location: 'methodology',
        color: '#ffd93d', // Yellow for moderate similarity
        matches: textMatches.content
      },
      {
        title: 'Open Access Journal Article',
        url: 'https://www.doaj.org/sample789',
        similarity: Math.random() * 8 + 2,
        matchType: 'citation',
        location: 'references',
        color: '#6bcf7f', // Green for low similarity
        matches: textMatches.title
      }
    ];

    // Select sources based on similarity level
    const sources = possibleSources.filter(() => Math.random() > 0.6);

    return {
      similarity: Math.round(baseSimilarity * 100) / 100,
      titleSimilarity: Math.round(titleSimilarity * 100) / 100,
      abstractSimilarity: Math.round(abstractSimilarity * 100) / 100,
      contentSimilarity: Math.round(contentSimilarity * 100) / 100,
      sources,
      textMatches,
      excludedSources: ['References', 'Common phrases', 'Methodology templates'],
      processingTime: Math.round(Math.random() * 180 + 120) // 2-5 minutes
    };
  }

  /**
   * Generate mock text matches for highlighting
   */
  generateMockTextMatches(title, abstract, content) {
    const matches = {
      title: [],
      abstract: [],
      content: []
    };

    // Generate matches for title if it exists
    if (title && Math.random() > 0.7) {
      const titleWords = title.split(' ');
      if (titleWords.length > 3) {
        const startIndex = Math.floor(Math.random() * (titleWords.length - 3));
        const matchLength = Math.min(3 + Math.floor(Math.random() * 3), titleWords.length - startIndex);
        matches.title.push({
          text: titleWords.slice(startIndex, startIndex + matchLength).join(' '),
          startIndex: titleWords.slice(0, startIndex).join(' ').length + (startIndex > 0 ? 1 : 0),
          endIndex: titleWords.slice(0, startIndex + matchLength).join(' ').length,
          similarity: Math.round((Math.random() * 30 + 70) * 100) / 100,
          sourceIndex: 0,
          color: '#ff6b6b'
        });
      }
    }

    // Generate matches for abstract
    if (abstract && Math.random() > 0.5) {
      const sentences = abstract.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const numMatches = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < Math.min(numMatches, sentences.length); i++) {
        const sentence = sentences[i].trim();
        const words = sentence.split(' ');
        if (words.length > 5) {
          const startWord = Math.floor(Math.random() * (words.length - 4));
          const matchLength = Math.min(4 + Math.floor(Math.random() * 6), words.length - startWord);
          const matchText = words.slice(startWord, startWord + matchLength).join(' ');
          
          // Calculate position in full abstract
          const beforeText = sentences.slice(0, i).join('. ') + (i > 0 ? '. ' : '');
          const sentenceStart = beforeText.length;
          const wordStart = words.slice(0, startWord).join(' ').length + (startWord > 0 ? 1 : 0);
          
          matches.abstract.push({
            text: matchText,
            startIndex: sentenceStart + wordStart,
            endIndex: sentenceStart + wordStart + matchText.length,
            similarity: Math.round((Math.random() * 25 + 60) * 100) / 100,
            sourceIndex: i % 2,
            color: i % 2 === 0 ? '#ff6b6b' : '#ffd93d'
          });
        }
      }
    }

    // Generate matches for content
    if (content && Math.random() > 0.4) {
      const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50);
      const numMatches = Math.floor(Math.random() * 4) + 1;
      
      for (let i = 0; i < Math.min(numMatches, paragraphs.length); i++) {
        const paragraph = paragraphs[i].trim();
        const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 15);
        
        if (sentences.length > 0) {
          const sentence = sentences[Math.floor(Math.random() * sentences.length)].trim();
          const words = sentence.split(' ');
          
          if (words.length > 6) {
            const startWord = Math.floor(Math.random() * (words.length - 5));
            const matchLength = Math.min(5 + Math.floor(Math.random() * 8), words.length - startWord);
            const matchText = words.slice(startWord, startWord + matchLength).join(' ');
            
            // Calculate position in full content
            const beforeParagraphs = paragraphs.slice(0, i).join('\n\n') + (i > 0 ? '\n\n' : '');
            const sentenceIndex = paragraph.indexOf(sentence);
            const wordStart = words.slice(0, startWord).join(' ').length + (startWord > 0 ? 1 : 0);
            
            matches.content.push({
              text: matchText,
              startIndex: beforeParagraphs.length + sentenceIndex + wordStart,
              endIndex: beforeParagraphs.length + sentenceIndex + wordStart + matchText.length,
              similarity: Math.round((Math.random() * 35 + 50) * 100) / 100,
              sourceIndex: i % 3,
              color: ['#ff6b6b', '#ffd93d', '#6bcf7f'][i % 3]
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Determine similarity status based on percentage
   */
  getSimilarityStatus(similarity) {
    if (similarity <= this.threshold.low) {
      return 'acceptable'; // Green - Good to go
    } else if (similarity <= this.threshold.medium) {
      return 'moderate'; // Yellow - Needs review
    } else {
      return 'high'; // Red - Requires attention
    }
  }

  /**
   * Get recommendations based on similarity level
   */
  getRecommendations(similarity) {
    if (similarity <= this.threshold.low) {
      return [
        'Similarity level is within acceptable range',
        'Manuscript can proceed to peer review',
        'Ensure proper citations are maintained'
      ];
    } else if (similarity <= this.threshold.medium) {
      return [
        'Moderate similarity detected - requires editorial review',
        'Check for proper paraphrasing and citations',
        'Consider revising sections with high similarity',
        'May proceed with caution after editor approval'
      ];
    } else {
      return [
        'High similarity detected - requires immediate attention',
        'Extensive revision needed before publication',
        'Check for potential plagiarism violations',
        'Consider rejection if similarities cannot be justified',
        'Author should provide detailed explanation'
      ];
    }
  }

  /**
   * Get similarity color coding for UI
   */
  getSimilarityColor(similarity) {
    if (similarity <= this.threshold.low) {
      return 'green';
    } else if (similarity <= this.threshold.medium) {
      return 'yellow';
    } else {
      return 'red';
    }
  }

  /**
   * Integration methods for external plagiarism services
   * These would be implemented for production use
   */

  /**
   * Turnitin API integration (example)
   */
  async checkWithTurnitin(content) {
    // Implementation for Turnitin API
    throw new Error('Turnitin integration not implemented - requires API key and setup');
  }

  /**
   * iThenticate API integration (example)
   */
  async checkWithiThenticate(content) {
    // Implementation for iThenticate API
    throw new Error('iThenticate integration not implemented - requires API key and setup');
  }

  /**
   * Copyleaks API integration (example)
   */
  async checkWithCopyleaks(content) {
    // Implementation for Copyleaks API
    throw new Error('Copyleaks integration not implemented - requires API key and setup');
  }
}

module.exports = new PlagiarismService();