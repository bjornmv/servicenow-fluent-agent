// Conditional adapter for the inspected AIUX 22.42.3 generated-JSON shape.
// Change URL-valued asset fields only, never arbitrary source/code strings.
export function normalizeAssetMetadata(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Expected an AIUX metadata record');
  }
  if (record.table !== 'sys_aix_widget') return record;
  let result = record;
  for (const name of ['component_compile_metadata', 'isolate_compile_metadata']) {
    const field = record.fields?.[name];
    if (field === undefined) continue;
    if (!field || typeof field !== 'object' || typeof field.value !== 'string') {
      throw new TypeError(`Unsupported AIUX metadata shape for ${name}`);
    }
    if (field.value === '') continue;
    const metadata = JSON.parse(field.value);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new TypeError(`Expected an object in ${name}`);
    }
    if (!Object.hasOwn(metadata, 'asset')) continue;
    if (typeof metadata.asset !== 'string' || !metadata.asset) {
      throw new TypeError(`Expected a non-empty asset path in ${name}`);
    }
    const asset = metadata.asset.replaceAll('\\', '/');
    if (asset.startsWith('/') || /^[a-zA-Z]+:/.test(asset) || asset.split('/').includes('..')) {
      throw new Error(`Expected a relative AIUX asset path in ${name}`);
    }
    if (asset === metadata.asset) continue;
    result = {
      ...result,
      fields: {
        ...result.fields,
        [name]: {...field, value: JSON.stringify({...metadata, asset})}
      }
    };
  }
  return result;
}
