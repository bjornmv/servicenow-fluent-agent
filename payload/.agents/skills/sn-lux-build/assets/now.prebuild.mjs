import {rollup} from '@servicenow/isomorphic-rollup';
import {buildManifestAndMetadata, getAiuxMetadataOutputDir} from '@servicenow/aiux/aiux-sdk/build';
import {normalizeAssetMetadata} from './scripts/normalize-aiux-assets.mjs';

// Optional Windows compatibility adapter. Review before copying into an app;
// merge an existing hook rather than overwriting it. No install/network step.
export default async function ({rootDir, config, fs, path, logger}) {
  const result = await buildManifestAndMetadata({
    projectRoot: rootDir,
    nowConfig: config,
    fs,
    rollup: options => rollup({...options, fs})
  });
  const output = getAiuxMetadataOutputDir({projectRoot: rootDir});
  let changed = 0;
  for (const name of fs.readdirSync(output)) {
    if (!name.startsWith('sys_aix_widget_') || !name.endsWith('.json')) continue;
    const file = path.join(output, name);
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = normalizeAssetMetadata(record);
    if (normalized !== record) {
      fs.writeFileSync(file, JSON.stringify(normalized, null, 2));
      changed++;
    }
  }
  logger.info(`AIUX build produced ${result.metadata.length} records; normalized asset URLs in ${changed} records`);
}
