'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { options } from './options';
import { defaultJobConfig, defaultDatasetConfig } from './jobConfig';
import { JobConfig } from '@/types';
import { objectCopy } from '@/utils/basic';
import { useNestedState } from '@/utils/hooks';
import { TextInput, SelectInput, Checkbox, FormGroup, NumberInput } from '@/components/formInputs';
import Card from '@/components/Card';
import { X } from 'lucide-react';
import useSettings from '@/hooks/useSettings';
import useGPUInfo from '@/hooks/useGPUInfo';
import useDatasetList from '@/hooks/useDatasetList';
import path from 'path';
import { TopBar, MainContent } from '@/components/layout';
import { Button } from '@headlessui/react';
import { FaChevronLeft } from 'react-icons/fa';

export default function TrainingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get('id');
  const [gpuIDs, setGpuIDs] = useState<string | null>(null);
  const { settings, isSettingsLoaded } = useSettings();
  const { gpuList, isGPUInfoLoaded } = useGPUInfo();
  const { datasets, status: datasetFetchStatus } = useDatasetList();
  const [datasetOptions, setDatasetOptions] = useState<{ value: string; label: string }[]>([]);

  const [jobConfig, setJobConfig] = useNestedState<JobConfig>(objectCopy(defaultJobConfig));
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isSettingsLoaded) return;
    if (datasetFetchStatus !== 'success') return;

    const datasetOptions = datasets.map(name => ({ value: path.join(settings.DATASETS_FOLDER, name), label: name }));
    setDatasetOptions(datasetOptions);
    const defaultDatasetPath = defaultDatasetConfig.folder_path;

    for (let i = 0; i < jobConfig.config.process[0].datasets.length; i++) {
      const dataset = jobConfig.config.process[0].datasets[i];
      if (dataset.folder_path === defaultDatasetPath) {
        setJobConfig(datasetOptions[0].value, `config.process[0].datasets[${i}].folder_path`);
      }
    }
  }, [datasets, settings, isSettingsLoaded, datasetFetchStatus]);

  useEffect(() => {
    if (runId) {
      fetch(`/api/jobs?id=${runId}`)
        .then(res => res.json())
        .then(data => {
          setGpuIDs(data.gpu_ids);
          setJobConfig(JSON.parse(data.job_config));
          // setJobConfig(data.name, 'config.name');
        })
        .catch(error => console.error('Error fetching training:', error));
    }
  }, [runId]);

  useEffect(() => {
    if (isGPUInfoLoaded) {
      if (gpuIDs === null && gpuList.length > 0) {
        setGpuIDs(`${gpuList[0].index}`);
      }
    }
  }, [gpuList, isGPUInfoLoaded]);

  useEffect(() => {
    if (isSettingsLoaded) {
      setJobConfig(settings.TRAINING_FOLDER, 'config.process[0].training_folder');
    }
  }, [settings, isSettingsLoaded]);

  const saveJob = async () => {
    if (status === 'saving') return;
    setStatus('saving');

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: runId,
          name: jobConfig.config.name,
          gpu_ids: gpuIDs,
          job_config: jobConfig,
        }),
      });

      if (!response.ok) throw new Error('Failed to save training');

      setStatus('success');
      if (!runId) {
        const data = await response.json();
        router.push(`/jobs/${data.id}`);
      }
      setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving training:', error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    saveJob();
  };

  console.log('jobConfig.config.process[0].network.linear', jobConfig?.config?.process[0].network?.linear);

  return (
    <>
      <TopBar>
        <div>
          <Button className="text-gray-500 dark:text-gray-300 px-3 mt-1" onClick={() => history.back()}>
            <FaChevronLeft />
          </Button>
        </div>
        <div>
          <h1 className="text-lg">{runId ? 'Edit Training Job' : 'New Training Job'}</h1>
        </div>
        <div className="flex-1"></div>
        <div>
          <Button
            className="text-gray-200 bg-green-800 px-3 py-1 rounded-md"
            onClick={() => saveJob()}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving...' : runId ? 'Update Job' : 'Create Job'}
          </Button>
        </div>
      </TopBar>
      <MainContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card title="Job Settings">
              <TextInput
                label="Training Name"
                value={jobConfig.config.name}
                onChange={value => setJobConfig(value, 'config.name')}
                placeholder="Enter training name"
                disabled={runId !== null}
                required
              />
              <SelectInput
                label="GPU ID"
                value={`${gpuIDs}`}
                onChange={value => setGpuIDs(value)}
                options={gpuList.map(gpu => ({ value: `${gpu.index}`, label: `GPU #${gpu.index}` }))}
              />
              <TextInput
                label="Trigger Word"
                value={jobConfig.config.process[0].trigger_word || ''}
                onChange={(value: string | null) => {
                  if (value?.trim() === '') {
                    value = null;
                  }
                  setJobConfig(value, 'jobConfig.config.process[0].trigger_word');
                }}
                placeholder=""
                required
              />
            </Card>

            {/* Model Configuration Section */}
            <Card title="Model Configuration">
              <SelectInput
                label="Name or Path"
                value={jobConfig.config.process[0].model.name_or_path}
                onChange={value => {
                  // see if model changed
                  const currentModel = options.model.find(
                    model => model.name_or_path === jobConfig.config.process[0].model.name_or_path,
                  );
                  if (!currentModel || currentModel.name_or_path === value) {
                    // model has not changed
                    return;
                  }
                  // revert defaults from previous model
                  for (const key in currentModel.defaults) {
                    setJobConfig(currentModel.defaults[key][1], key);
                  }
                  // set new model
                  setJobConfig(value, 'config.process[0].model.name_or_path');
                  // update the defaults when a model is selected
                  const model = options.model.find(model => model.name_or_path === value);
                  if (model?.defaults) {
                    for (const key in model.defaults) {
                      setJobConfig(model.defaults[key][0], key);
                    }
                  }
                }}
                options={options.model.map(model => ({
                  value: model.name_or_path,
                  label: model.name_or_path,
                }))}
              />
              <FormGroup label="Quantize">
                <div className='grid grid-cols-2 gap-2'>
                <Checkbox
                  label="Transformer"
                  checked={jobConfig.config.process[0].model.quantize}
                  onChange={value => setJobConfig(value, 'config.process[0].model.quantize')}
                />
                <Checkbox
                  label="Text Encoder"
                  checked={jobConfig.config.process[0].model.quantize_te}
                  onChange={value => setJobConfig(value, 'config.process[0].model.quantize_te')}
                />
                </div>
              </FormGroup>
            </Card>
            {jobConfig.config.process[0].network?.type && (
              <Card title="LoRA Configuration">
                <NumberInput
                  label="Linear Rank"
                  value={jobConfig.config.process[0].network.linear}
                  onChange={value => {
                    console.log('onChange', value);
                    setJobConfig(value, 'config.process[0].network.linear');
                    setJobConfig(value, 'config.process[0].network.linear_alpha');
                  }}
                  placeholder="eg. 16"
                  min={0}
                  max={1024}
                  required
                />
              </Card>
            )}
            <Card title="Save Configuration">
              <SelectInput
                label="Data Type"
                value={jobConfig.config.process[0].save.dtype}
                onChange={value => setJobConfig(value, 'config.process[0].save.dtype')}
                options={[
                  { value: 'bf16', label: 'BF16' },
                  { value: 'fp16', label: 'FP16' },
                  { value: 'fp32', label: 'FP32' },
                ]}
              />
              <NumberInput
                label="Save Every"
                value={jobConfig.config.process[0].save.save_every}
                onChange={value => setJobConfig(value, 'config.process[0].save.save_every')}
                placeholder="eg. 250"
                min={1}
                required
              />
              <NumberInput
                label="Max Step Saves to Keep"
                value={jobConfig.config.process[0].save.max_step_saves_to_keep}
                onChange={value => setJobConfig(value, 'config.process[0].save.max_step_saves_to_keep')}
                placeholder="eg. 4"
                min={1}
                required
              />
            </Card>
          </div>
          <div>
            <Card title="Training Configuration">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <NumberInput
                    label="Batch Size"
                    value={jobConfig.config.process[0].train.batch_size}
                    onChange={value => setJobConfig(value, 'config.process[0].train.batch_size')}
                    placeholder="eg. 4"
                    min={1}
                    required
                  />
                  <NumberInput
                    label="Gradient Accumulation"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.gradient_accumulation}
                    onChange={value => setJobConfig(value, 'config.process[0].train.gradient_accumulation')}
                    placeholder="eg. 1"
                    min={1}
                    required
                  />
                  <NumberInput
                    label="Steps"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.steps}
                    onChange={value => setJobConfig(value, 'config.process[0].train.steps')}
                    placeholder="eg. 2000"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <SelectInput
                    label="Optimizer"
                    value={jobConfig.config.process[0].train.optimizer}
                    onChange={value => setJobConfig(value, 'config.process[0].train.optimizer')}
                    options={[
                      { value: 'adamw8bit', label: 'AdamW8Bit' },
                      { value: 'adafactor', label: 'Adafactor' },
                    ]}
                  />
                  <NumberInput
                    label="Learning Rate"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.lr}
                    onChange={value => setJobConfig(value, 'config.process[0].train.lr')}
                    placeholder="eg. 0.0001"
                    min={0}
                    required
                  />
                  <NumberInput
                    label="Weight Decay"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.optimizer_params.weight_decay}
                    onChange={value => setJobConfig(value, 'config.process[0].train.optimizer_params.weight_decay')}
                    placeholder="eg. 0.0001"
                    min={0}
                    required
                  />
                </div>
                <div>
                  <SelectInput
                    label="Timestep Type"
                    value={jobConfig.config.process[0].train.timestep_type}
                    onChange={value => setJobConfig(value, 'config.process[0].train.timestep_type')}
                    options={[
                      { value: 'sigmoid', label: 'Sigmoid' },
                      { value: 'linear', label: 'Linear' },
                      { value: 'flux_shift', label: 'Flux Shift' },
                    ]}
                  />
                  <SelectInput
                    label="Timestep Bias"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.content_or_style}
                    onChange={value => setJobConfig(value, 'config.process[0].train.content_or_style')}
                    options={[
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'content', label: 'High Noise' },
                      { value: 'style', label: 'Low Noise' },
                    ]}
                  />
                  <SelectInput
                    label="Noise Scheduler"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.noise_scheduler}
                    onChange={value => setJobConfig(value, 'config.process[0].train.noise_scheduler')}
                    options={[{ value: 'flowmatch', label: 'FlowMatch' }]}
                  />
                </div>
                <div>
                  <FormGroup label="EMA (Exponential Moving Average)">
                    <Checkbox
                      label="Use EMA"
                      className='pt-1'
                      checked={jobConfig.config.process[0].train.ema_config?.use_ema || false}
                      onChange={value => setJobConfig(value, 'config.process[0].train.ema_config.use_ema')}
                    />
                  </FormGroup>
                  <NumberInput
                    label="EMA Decay"
                    className="pt-2"
                    value={jobConfig.config.process[0].train.ema_config?.ema_decay as number}
                    onChange={value => setJobConfig(value, 'config.process[0].train.ema_config?.ema_decay')}
                    placeholder="eg. 0.99"
                    min={0}
                  />
                </div>
              </div>
            </Card>
          </div>
          <div>
            <Card title="Datasets">
              <>
                {jobConfig.config.process[0].datasets.map((dataset, i) => (
                  <div key={i} className="p-4 rounded-lg bg-gray-800 relative">
                    <button
                      type="button"
                      onClick={() =>
                        setJobConfig(
                          jobConfig.config.process[0].datasets.filter((_, index) => index !== i),
                          'config.process[0].datasets',
                        )
                      }
                      className="absolute top-2 right-2 bg-red-800 hover:bg-red-700 rounded-full p-1 text-sm transition-colors"
                    >
                      <X />
                    </button>
                    <h2 className="text-lg font-bold mb-4">Dataset {i + 1}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <SelectInput
                          label="Dataset"
                          value={dataset.folder_path}
                          onChange={value => setJobConfig(value, `config.process[0].datasets[${i}].folder_path`)}
                          options={datasetOptions}
                        />
                        <NumberInput
                          label="LoRA Weight"
                          value={dataset.network_weight}
                          className="pt-2"
                          onChange={value => setJobConfig(value, `config.process[0].datasets[${i}].network_weight`)}
                          placeholder="eg. 1.0"
                        />
                      </div>
                      <div>
                        <TextInput
                          label="Default Caption"
                          value={dataset.default_caption}
                          onChange={value => setJobConfig(value, `config.process[0].datasets[${i}].default_caption`)}
                          placeholder="eg. A photo of a cat"
                        />
                        <NumberInput
                          label="Caption Dropout Rate"
                          className="pt-2"
                          value={dataset.caption_dropout_rate}
                          onChange={value =>
                            setJobConfig(value, `config.process[0].datasets[${i}].caption_dropout_rate`)
                          }
                          placeholder="eg. 0.05"
                          min={0}
                          required
                        />
                      </div>
                      <div>
                        <FormGroup label="Settings" className="">
                          <Checkbox
                            label="Cache Latents"
                            checked={dataset.cache_latents_to_disk || false}
                            onChange={value =>
                              setJobConfig(value, `config.process[0].datasets[${i}].cache_latents_to_disk`)
                            }
                          />
                          <Checkbox
                            label="Is Regularization"
                            checked={dataset.is_reg || false}
                            onChange={value => setJobConfig(value, `config.process[0].datasets[${i}].is_reg`)}
                          />
                        </FormGroup>
                      </div>
                      <div>
                        <FormGroup label="Resolutions" className="pt-2">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              [256, 512, 768],
                              [1024, 1280, 1536],
                            ].map(resGroup => (
                              <div key={resGroup[0]} className="space-y-2">
                                {resGroup.map(res => (
                                  <Checkbox
                                    key={res}
                                    label={res.toString()}
                                    checked={dataset.resolution.includes(res)}
                                    onChange={value => {
                                      const resolutions = dataset.resolution.includes(res)
                                        ? dataset.resolution.filter(r => r !== res)
                                        : [...dataset.resolution, res];
                                      setJobConfig(resolutions, `config.process[0].datasets[${i}].resolution`);
                                    }}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </FormGroup>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setJobConfig(
                      [...jobConfig.config.process[0].datasets, objectCopy(defaultDatasetConfig)],
                      'config.process[0].datasets',
                    )
                  }
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Add Dataset
                </button>
              </>
            </Card>
          </div>
          <div>
            <Card title="Sample Configuration">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <NumberInput
                    label="Sample Every"
                    value={jobConfig.config.process[0].sample.sample_every}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.sample_every')}
                    placeholder="eg. 250"
                    min={1}
                    required
                  />
                  <SelectInput
                    label="Sampler"
                    className="pt-2"
                    value={jobConfig.config.process[0].sample.sampler}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.sampler')}
                    options={[{ value: 'flowmatch', label: 'FlowMatch' }]}
                  />
                </div>
                <div>
                  <NumberInput
                    label="Guidance Scale"
                    value={jobConfig.config.process[0].sample.guidance_scale}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.guidance_scale')}
                    placeholder="eg. 1.0"
                    min={0}
                    required
                  />
                  <NumberInput
                    label="Sample Steps"
                    value={jobConfig.config.process[0].sample.sample_steps}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.sample_steps')}
                    placeholder="eg. 1"
                    className="pt-2"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <NumberInput
                    label="Width"
                    value={jobConfig.config.process[0].sample.width}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.width')}
                    placeholder="eg. 1024"
                    min={256}
                    required
                  />
                  <NumberInput
                    label="Height"
                    value={jobConfig.config.process[0].sample.height}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.height')}
                    placeholder="eg. 1024"
                    className="pt-2"
                    min={256}
                    required
                  />
                </div>

                <div>
                  <NumberInput
                    label="Seed"
                    value={jobConfig.config.process[0].sample.seed}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.seed')}
                    placeholder="eg. 0"
                    min={0}
                    required
                  />
                  <Checkbox
                    label="Walk Seed"
                    className="pt-4 pl-2"
                    checked={jobConfig.config.process[0].sample.walk_seed}
                    onChange={value => setJobConfig(value, 'config.process[0].sample.walk_seed')}
                  />
                </div>
              </div>
              <FormGroup
                label={`Sample Prompts (${jobConfig.config.process[0].sample.prompts.length})`}
                className="pt-2"
              >
                {jobConfig.config.process[0].sample.prompts.map((prompt, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <div className="flex-1">
                      <TextInput
                        value={prompt}
                        onChange={value => setJobConfig(value, `config.process[0].sample.prompts[${i}]`)}
                        placeholder="Enter prompt"
                        required
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setJobConfig(
                            jobConfig.config.process[0].sample.prompts.filter((_, index) => index !== i),
                            'config.process[0].sample.prompts',
                          )
                        }
                        className="rounded-full p-1 text-sm"
                      >
                        <X />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setJobConfig(
                      [...jobConfig.config.process[0].sample.prompts, ''],
                      'config.process[0].sample.prompts',
                    )
                  }
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Add Prompt
                </button>
              </FormGroup>
            </Card>
          </div>

          {status === 'success' && <p className="text-green-500 text-center">Training saved successfully!</p>}
          {status === 'error' && <p className="text-red-500 text-center">Error saving training. Please try again.</p>}
        </form>
        <div className="pt-20"></div>
      </MainContent>
    </>
  );
}
