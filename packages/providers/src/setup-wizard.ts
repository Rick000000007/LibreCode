import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';
import type { LibreConfig } from 'librecode-types';
import { ProviderRegistry } from './provider-registry.js';
import { ConfigurationManager } from './configuration-manager.js';
import { ProviderFactory } from './provider-factory.js';
import type { LLMProvider } from './base.js';

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

export class SetupWizard {
  private registry: ProviderRegistry;
  private configManager: ConfigurationManager;

  constructor(registry: ProviderRegistry, configManager: ConfigurationManager) {
    this.registry = registry;
    this.configManager = configManager;
  }

  async run(): Promise<boolean> {
    const rl = readline.createInterface({ input, output });

    try {
      output.write('\x1B[36m╭──────────────────────────────────────╮\x1B[39m\n');
      output.write('\x1B[36m│\x1B[39m  \x1B[1mWelcome to LibreCode\x1B[22m                  \x1B[36m│\x1B[39m\n');
      output.write('\x1B[36m│\x1B[39m  Let\'s set up your AI provider.        \x1B[36m│\x1B[39m\n');
      output.write('\x1B[36m╰──────────────────────────────────────╯\x1B[39m\n\n');

      const providers = this.registry.all();
      
      const local = providers.filter(p => p.id !== 'free' && this.registry.deriveCapabilities(p.id).localServer);
      const free = providers.filter(p => p.id !== 'free' && p.hasFreeTier && !this.registry.deriveCapabilities(p.id).localServer);
      const cloud = providers.filter(p => p.id !== 'free' && !p.hasFreeTier && !this.registry.deriveCapabilities(p.id).localServer);

      output.write('Choose an AI provider:\n\n');
      let index = 0;
      const choices: string[] = [];
      
      output.write(`  \x1B[33m0.\x1B[39m ⭐ \x1B[32mFree\x1B[39m (Auto-routing best free models)\n`);
      choices.push('free');
      
      if (local.length > 0) {
         output.write(`\n  🏠 \x1B[90mLocal\x1B[39m\n`);
         for (const p of local) {
            index++;
            choices.push(p.id);
            output.write(`  \x1B[33m${index}.\x1B[39m ${p.name}\n`);
         }
      }
      
      if (free.length > 0) {
         output.write(`\n  ⭐ \x1B[90mRecommended Free\x1B[39m\n`);
         for (const p of free) {
            index++;
            choices.push(p.id);
            output.write(`  \x1B[33m${index}.\x1B[39m ${p.name}\n`);
         }
      }
      
      if (cloud.length > 0) {
         output.write(`\n  ☁ \x1B[90mCloud Premium\x1B[39m\n`);
         for (const p of cloud) {
            index++;
            choices.push(p.id);
            output.write(`  \x1B[33m${index}.\x1B[39m ${p.name}\n`);
         }
      }
      
      index++;
      output.write(`\n  \x1B[33m${index}.\x1B[39m Configure Later\n\n`);

      const choice = await rl.question(`\x1B[90mEnter choice (0-${index}): \x1B[39m`);
      const num = parseInt(choice.trim(), 10);

      if (isNaN(num) || num < 0 || num > index) {
        output.write('\x1B[33mNo provider configured. Run `librecode` again to set up.\x1B[39m\n');
        this.saveEmpty();
        return false;
      }

      if (num === 0) {
        output.write(`\n\x1B[32m✓ Free provider configured successfully! Using best available free model.\x1B[39m\n`);
        this.saveEmpty();
        return true;
      }

      if (num === index) {
        output.write('\x1B[33mYou can configure a provider later with `librecode provider login`.\x1B[39m\n');
        this.saveEmpty();
        return false;
      }

      const selectedId = choices[num];
      return await this.configureProviderInteractiveWithRl(rl, selectedId!);
    } finally {
      rl.close();
    }
  }

  async configureProviderInteractive(providerId: string): Promise<boolean> {
     const rl = readline.createInterface({ input, output });
     try {
        return await this.configureProviderInteractiveWithRl(rl, providerId);
     } finally {
        rl.close();
     }
  }

  private async configureProviderInteractiveWithRl(rl: readline.Interface, providerId: string): Promise<boolean> {
    const meta = this.registry.get(providerId);
    if (!meta) return false;

    output.write(`\n\x1B[36m── ${meta.name} Configuration ──\x1B[39m\n\n`);

    const caps = this.registry.deriveCapabilities(providerId);
    
    output.write(`\x1B[1mProvider:\x1B[22m ${meta.name}\n`);
    output.write(`\x1B[1mDescription:\x1B[22m ${meta.description}\n`);
    
    let authType = 'None';
    if (caps.apiKeys) authType = 'API Key';
    if (caps.browserLogin) authType = 'Browser Login';
    if (caps.localServer) authType = 'Local Server';
    output.write(`\x1B[1mAuthentication:\x1B[22m ${authType}\n`);
    output.write(`\x1B[1mFree Tier:\x1B[22m ${meta.hasFreeTier ? 'Yes' : 'No'}\n`);
    output.write(`\x1B[1mStreaming Support:\x1B[22m ${meta.supportsStreaming ? 'Yes' : 'No'}\n`);
    output.write(`\x1B[1mTool Calling Support:\x1B[22m ${meta.supportsToolCalling ? 'Yes' : 'No'}\n`);
    output.write(`\x1B[1mDocumentation:\x1B[22m ${meta.docsUrl || meta.website}\n\n`);

    const config: LibreConfig = this.configManager.load() || { defaultProvider: 'free', providers: {} };
    config.defaultProvider = providerId;
    if (!config.providers) config.providers = {};

    let apiKey = '';
    let validationFailed = false;

    if (caps.browserLogin || caps.deviceFlow) {
       output.write(`\x1B[1mBrowser Login Supported\x1B[22m\n`);
       output.write(`\x1B[33mThis authentication flow is not yet implemented.\x1B[39m\n`);
       return false;
    } else if (caps.apiKeys) {
      const keyUrl = meta.keyUrl || meta.docsUrl || meta.website || '';
      if (keyUrl) {
        const openDocs = await rl.question(`\x1B[90mOpen API key page in browser? (Y/n): \x1B[39m`);
        if (openDocs.trim().toLowerCase() !== 'n') {
           openBrowser(keyUrl);
        }
      }
      
      apiKey = await rl.question(`\n\x1B[90mEnter your ${meta.name} API key (or leave blank to skip): \x1B[39m`);
      if (!apiKey.trim()) {
        output.write('\x1B[33mSkipped. Run `librecode provider login` later to configure.\x1B[39m\n');
        return false;
      }
      
      output.write('\x1B[90mValidating key...\x1B[39m ');
      
      try {
         const factory = new ProviderFactory(this.registry);
         const tempProvider = factory.create(providerId, { enabled: true, apiKey: apiKey.trim(), defaultModel: meta.defaultModel });
         const health = await tempProvider.health();
         if (health.status === 'unhealthy') {
            throw new Error(health.message || 'Health check failed');
         }
         output.write('\x1B[32m✓ Connected\x1B[39m\n');
         
         let finalModel = meta.defaultModel;
         output.write('\x1B[90mDiscovering available models...\x1B[39m\n');
         try {
             const models = await tempProvider.listModels();
             if (models.length > 0) {
                 output.write('\nAvailable Models:\n');
                 const displayLimit = Math.min(models.length, 15);
                 for (let i = 0; i < displayLimit; i++) {
                     output.write(`  \x1B[33m${i + 1}.\x1B[39m ${models[i]!.name || models[i]!.id}\n`);
                 }
                 if (models.length > displayLimit) {
                     output.write(`  ... and ${models.length - displayLimit} more\n`);
                 }
                  try {
                    const mChoice = await rl.question(`\n\x1B[90mSelect model [1-${displayLimit}] (default: 1): \x1B[39m`);
                    const mIdx = parseInt(mChoice.trim(), 10);
                    if (!isNaN(mIdx) && mIdx >= 1 && mIdx <= displayLimit) {
                        finalModel = models[mIdx - 1]!.id;
                    } else {
                        finalModel = models[0]!.id;
                    }
                  } catch {
                    // Non-interactive or pipe mode — keep the provider default
                  }
              } else {
                  output.write('\x1B[33mNo models discovered, using default.\x1B[39m\n');
              }
          } catch (err) {
              output.write('\x1B[33mModel discovery failed, using default.\x1B[39m\n');
          }

          config.providers[providerId] = {
            enabled: true,
            apiKey: apiKey.trim(),
            defaultModel: finalModel,
         };
         output.write(`\n\x1B[32m✓ Configuration saved.\x1B[39m\n`);
      } catch (err) {
          validationFailed = true;
          output.write(`\x1B[31m✘ Validation failed: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
          let saveAnyway = false;
          try {
            const retry = await rl.question('\x1B[33mSave anyway? (y/N): \x1B[39m');
            saveAnyway = retry.trim().toLowerCase() === 'y';
          } catch {
            saveAnyway = false;
          }
          if (!saveAnyway) {
             return false;
          }
         config.providers[providerId] = {
           enabled: true,
           apiKey: apiKey.trim(),
           defaultModel: meta.defaultModel,
         };
      }
    } else if (caps.localServer) {
       output.write(`\n\x1B[1mLocal Provider Detected\x1B[22m\n`);
       const defaultEndpoint = providerId === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1';
       const endpoint = await rl.question(
         `\x1B[90mEnter ${meta.name} endpoint (default: ${defaultEndpoint}): \x1B[39m`,
       );
       
       let finalModel = meta.defaultModel;
       const finalEndpoint = endpoint.trim() || defaultEndpoint;
       
       output.write('\x1B[90mConnecting...\x1B[39m ');
       try {
           const factory = new ProviderFactory(this.registry);
           const tempProvider = factory.create(providerId, { enabled: true, endpoint: finalEndpoint, defaultModel: meta.defaultModel });
           const health = await tempProvider.health();
           if (health.status === 'unhealthy') {
              throw new Error(health.message || 'Health check failed');
           }
            output.write('\x1B[32m✓ Connected\x1B[39m\n');
            
            output.write('\x1B[90mDiscovering available models...\x1B[39m\n');
            try {
                const models = await tempProvider.listModels();
                if (models.length > 0) {
                    output.write('\nAvailable Models:\n');
                    const displayLimit = Math.min(models.length, 15);
                    for (let i = 0; i < displayLimit; i++) {
                        output.write(`  \x1B[33m${i + 1}.\x1B[39m ${models[i]!.name || models[i]!.id}\n`);
                    }
                    if (models.length > displayLimit) {
                        output.write(`  ... and ${models.length - displayLimit} more\n`);
                    }
                    try {
                      const mChoice = await rl.question(`\n\x1B[90mSelect model [1-${displayLimit}] (default: 1): \x1B[39m`);
                      const mIdx = parseInt(mChoice.trim(), 10);
                      if (!isNaN(mIdx) && mIdx >= 1 && mIdx <= displayLimit) {
                          finalModel = models[mIdx - 1]!.id;
                      } else {
                          finalModel = models[0]!.id;
                      }
                    } catch {
                      // Non-interactive or pipe mode — keep the provider default
                    }
                } else {
                    output.write('\x1B[33mNo models discovered, using default.\x1B[39m\n');
                }
            } catch (err) {
                output.write('\x1B[33mModel discovery failed, using default.\x1B[39m\n');
            }
        } catch (err) {
            output.write(`\x1B[31m✘ Connection failed: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
            let saveAnyway = false;
            try {
              const retry = await rl.question('\x1B[33mSave anyway? (y/N): \x1B[39m');
              saveAnyway = retry.trim().toLowerCase() === 'y';
            } catch {
              saveAnyway = false;
            }
            if (!saveAnyway) {
               return false;
            }
        }

       config.providers[providerId] = {
         enabled: true,
         endpoint: finalEndpoint,
         defaultModel: finalModel,
       };
    } else {
       // Fallback if none are matched, just use old logic
       const endpoint = await rl.question(
         `\x1B[90mEnter ${meta.name} endpoint [${meta.defaultModel}]: \x1B[39m`,
       );
       config.providers[providerId] = {
         enabled: true,
         endpoint: endpoint.trim() || undefined,
         defaultModel: meta.defaultModel,
       };
    }

    this.configManager.save(config);
    output.write(`\n\x1B[32m✓ ${meta.name} configured securely!\x1B[39m\n`);

    // Post-setup test
    if (!validationFailed) {
      try {
        const runTest = await rl.question('\x1B[90mRun test (health → chat → streaming)? (Y/n): \x1B[39m');
        if (runTest.trim().toLowerCase() !== 'n') {
          await this.runPostSetupTest(rl, providerId, apiKey, meta.defaultModel);
        }
      } catch {
        output.write('\x1B[33mTest skipped (non-interactive mode).\x1B[39m\n');
        output.write('\x1B[90m  Run `librecode doctor` or `/provider test` to verify later.\x1B[39m\n');
      }
    }

    return true;
  }

  private async runPostSetupTest(
    rl: readline.Interface,
    providerId: string,
    apiKey: string,
    model: string,
  ): Promise<void> {
    const factory = new ProviderFactory(this.registry);

    let provider: LLMProvider;
    try {
      provider = factory.create(providerId, {
        enabled: true,
        apiKey,
        defaultModel: model,
      });
    } catch (err) {
      output.write(`  \x1B[31m✘ Failed to create provider: ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
      return;
    }

    const meta = this.registry.get(providerId);

    output.write('\n');

    // 1. Health check
    output.write(`  \x1B[90m1/3  Health check...\x1B[39m `);
    try {
      const health = await provider.health();
      if (health.status === 'unhealthy') {
        output.write(`\x1B[31m✘ ${health.message}\x1B[39m\n`);
        return;
      }
      output.write(`\x1B[32m✓\x1B[39m \x1B[90m${health.message}\x1B[39m\n`);
    } catch (err) {
      output.write(`\x1B[31m✘ ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
      return;
    }

    // 2. Chat test
    output.write(`  \x1B[90m2/3  Chat test...\x1B[39m `);
    try {
      const result = await provider.complete({
        model,
        messages: [{ role: 'user', content: 'Say OK' }],
        tools: [],
        maxTokens: 10,
        stream: false,
      });
      if (result.content) {
        const preview = result.content.slice(0, 60).replace(/\n/g, '\\n');
        output.write(`\x1B[32m✓\x1B[39m \x1B[90m"${preview}"\x1B[39m\n`);
      } else {
        output.write(`\x1B[33m⚠ No content in response\x1B[39m\n`);
      }
    } catch (err) {
      output.write(`\x1B[31m✘ ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
    }

    // 3. Streaming test
    if (meta?.supportsStreaming) {
      output.write(`  \x1B[90m3/3  Streaming test...\x1B[39m `);
      try {
        let streamedText = '';
        await provider.streamComplete(
          {
            model,
            messages: [{ role: 'user', content: 'Say hi' }],
            tools: [],
            maxTokens: 10,
            stream: true,
          },
          (event) => {
            if (event.type === 'text_delta') {
              streamedText += event.delta;
            }
          },
        );
        if (streamedText.length > 0) {
          const preview = streamedText.slice(0, 60).replace(/\n/g, '\\n');
          output.write(`\x1B[32m✓\x1B[39m \x1B[90m"${preview}"\x1B[39m\n`);
        } else {
          output.write(`\x1B[33m⚠ Empty stream\x1B[39m\n`);
        }
      } catch (err) {
        output.write(`\x1B[31m✘ ${err instanceof Error ? err.message : String(err)}\x1B[39m\n`);
      }
    } else {
      output.write(`  \x1B[90m3/3  Streaming: \x1B[33mnot supported by this provider\x1B[39m\n`);
    }

    output.write(`\n  \x1B[32m✓ All tests complete!\x1B[39m\n`);
  }

  private saveEmpty(): void {
    const config: LibreConfig = this.configManager.load() || { defaultProvider: 'free', providers: {} };
    config.defaultProvider = 'free';
    this.configManager.save(config);
  }
}
