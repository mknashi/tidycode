class FormatterService {
  constructor() {
    this.formatterEngine = null;
  }

  async fix(content, errorDetails, onProgress) {
    if (onProgress) {
      onProgress({ progress: 50, text: 'Processing...', timeElapsed: 0 });
    }

    if (errorDetails.type === 'JSON' || errorDetails.type === 'XML') {
      return await this.fixWithFormatterEngine(content, errorDetails);
    }

    throw new Error(`Auto-fix only supports JSON and XML files. Current type: ${errorDetails.type}`);
  }

  async fixWithFormatterEngine(content, errorDetails) {
    try {
      const { InferenceEngine } = await import('tinyllm');

      if (!this.formatterEngine) {
        this.formatterEngine = new InferenceEngine({ useAI: false, maxRetries: 3 });
        await this.formatterEngine.initialize();
      }

      let result;
      if (errorDetails.type === 'JSON') {
        result = await this.formatterEngine.fixJSON(content);
      } else if (errorDetails.type === 'XML') {
        result = await this.formatterEngine.fixXML(content);
      } else {
        throw new Error(`TinyLLM only supports JSON and XML files. Current type: ${errorDetails.type}`);
      }

      if (result && (result.success || result.fixed)) {
        return result.fixed.trim();
      }

      const errorMsg = result?.errors?.map(e => e.message).join(', ') || 'Unknown error';
      throw new Error(`Could not fix the content: ${errorMsg}`);
    } catch (error) {
      throw new Error(`Fix error: ${error.message}`);
    }
  }
}

export const formatterService = new FormatterService();
