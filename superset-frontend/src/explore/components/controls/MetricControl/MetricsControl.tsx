/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ensureIsArray, Metric, usePrevious } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { isEqual } from 'lodash-es';
import ControlHeader from 'src/explore/components/ControlHeader';
import { Icons } from '@superset-ui/core/components/Icons';
import {
  AddIconButton,
  AddControlLabel,
  HeaderContainer,
  LabelsContainer,
} from 'src/explore/components/controls/OptionControls';
import MetricDefinitionValue from './MetricDefinitionValue';
import AdhocMetric, { dedupeAdhocMetricOptionName } from './AdhocMetric';
import AdhocMetricPopoverTrigger from './AdhocMetricPopoverTrigger';
import { savedMetricType } from './types';

type AdhocMetricConfig = ConstructorParameters<typeof AdhocMetric>[0];

type MetricLike =
  | string
  | {
      metric_name?: string;
      optionName?: string;
      column?: { column_name?: string } | null;
    };

type ColumnLike = { column_name?: string };

function getOptionsForSavedMetrics(
  savedMetrics: savedMetricType[] | undefined,
  currentMetricValues: unknown,
  currentMetric: unknown,
) {
  return (
    savedMetrics?.filter(savedMetric =>
      Array.isArray(currentMetricValues)
        ? !currentMetricValues.includes(savedMetric.metric_name) ||
          savedMetric.metric_name === currentMetric
        : savedMetric,
    ) ?? []
  );
}

function isDictionaryForAdhocMetric(
  value: unknown,
): value is AdhocMetricConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof AdhocMetric) &&
    Boolean((value as { expressionType?: unknown }).expressionType)
  );
}

// adhoc metrics are stored as dictionaries in URL params. We convert them back into the
// AdhocMetric class for typechecking, consistency and instance method access.
function coerceAdhocMetrics(value: unknown): unknown[] {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    if (isDictionaryForAdhocMetric(value)) {
      return [new AdhocMetric(value)];
    }
    return [value];
  }
  // Metrics are identified by optionName when editing; regenerate any that
  // collide so each keeps a unique identity (see dedupeAdhocMetricOptionName).
  const seenOptionNames = new Set<string>();
  return value.map((val: unknown) => {
    if (isDictionaryForAdhocMetric(val)) {
      return dedupeAdhocMetricOptionName(new AdhocMetric(val), seenOptionNames);
    }
    return val;
  });
}

const emptySavedMetric = { metric_name: '', expression: '' };

// TODO: use typeguards to distinguish saved metrics from adhoc metrics
const getMetricsMatchingCurrentDataset = (
  value: unknown,
  columns: ColumnLike[] | undefined,
  savedMetrics: savedMetricType[] | undefined,
) =>
  ensureIsArray(value as MetricLike | MetricLike[]).filter(metric => {
    if (typeof metric === 'string' || metric.metric_name) {
      const metricName =
        typeof metric === 'string' ? metric : metric.metric_name;
      return savedMetrics?.some(
        savedMetric => savedMetric.metric_name === metricName,
      );
    }
    return columns?.some(
      column =>
        !metric.column || metric.column.column_name === column.column_name,
    );
  });

export interface MetricsControlProps {
  name: string;
  onChange: (value: unknown) => void;
  multi?: boolean;
  value?: unknown;
  columns?: unknown[];
  savedMetrics?: unknown[];
  datasource?: unknown;
  clearable?: boolean;
  isLoading?: boolean;
  [key: string]: unknown;
}

const MetricsControl = ({
  onChange = () => {},
  multi,
  value: propsValue,
  columns = [],
  savedMetrics = [],
  datasource,
  ...props
}: MetricsControlProps) => {
  const [value, setValue] = useState(coerceAdhocMetrics(propsValue));
  const prevColumns = usePrevious(columns);
  const prevSavedMetrics = usePrevious(savedMetrics);

  const handleChange = useCallback(
    (opts: unknown) => {
      // if clear out options
      if (opts === null) {
        onChange(null);
        return;
      }

      const transformedOpts = ensureIsArray(opts);
      const optionValues = transformedOpts
        .map(option => {
          // pre-defined metric
          if (
            typeof option === 'object' &&
            option !== null &&
            'metric_name' in option &&
            option.metric_name
          ) {
            return option.metric_name;
          }
          return option;
        })
        .filter((option: unknown) => option);
      onChange(multi ? optionValues : optionValues[0]);
    },
    [multi, onChange],
  );

  const onNewMetric = useCallback(
    (newMetric: unknown) => {
      const newValue = [...value, newMetric];
      setValue(newValue);
      handleChange(newValue);
    },
    [handleChange, value],
  );

  const onMetricEdit = useCallback(
    (changedMetric: Metric, oldMetric: Metric & { optionName?: string }) => {
      const newValue = value.map(val => {
        const { optionName } = (val ?? {}) as Exclude<MetricLike, string>;
        if (
          // compare saved metrics
          val === oldMetric.metric_name ||
          // compare adhoc metrics
          typeof optionName !== 'undefined'
            ? optionName === oldMetric.optionName
            : false
        ) {
          return changedMetric;
        }
        return val;
      });
      setValue(newValue);
      handleChange(newValue);
    },
    [handleChange, value],
  );

  const onRemoveMetric = useCallback(
    (index: number) => {
      if (!Array.isArray(value)) {
        return;
      }
      const valuesCopy = [...value];
      valuesCopy.splice(index, 1);
      setValue(valuesCopy);
      handleChange(valuesCopy);
    },
    [handleChange, value],
  );

  const moveLabel = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const newValues = [...value];
      [newValues[hoverIndex], newValues[dragIndex]] = [
        newValues[dragIndex],
        newValues[hoverIndex],
      ];
      setValue(newValues);
    },
    [value],
  );

  const isAddNewMetricDisabled = useCallback(
    () => !multi && value.length > 0,
    [multi, value.length],
  );

  const savedMetricOptions = useMemo(
    () =>
      getOptionsForSavedMetrics(
        savedMetrics as savedMetricType[],
        propsValue,
        null,
      ),
    [propsValue, savedMetrics],
  );

  const newAdhocMetric = useMemo(() => new AdhocMetric({}), [value]);
  const addNewMetricPopoverTrigger = useCallback(
    (trigger: React.ReactNode) => {
      if (isAddNewMetricDisabled()) {
        return trigger;
      }
      return (
        <AdhocMetricPopoverTrigger
          adhocMetric={newAdhocMetric}
          onMetricEdit={onNewMetric}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns={columns as any}
          savedMetricsOptions={savedMetricOptions}
          savedMetric={emptySavedMetric}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          datasource={datasource as any}
          isNew
        >
          {trigger}
        </AdhocMetricPopoverTrigger>
      );
    },
    [
      columns,
      datasource,
      isAddNewMetricDisabled,
      newAdhocMetric,
      onNewMetric,
      savedMetricOptions,
    ],
  );

  useEffect(() => {
    // Remove selected custom metrics that do not exist in the dataset anymore
    // Remove selected adhoc metrics that use columns which do not exist in the dataset anymore
    if (
      propsValue &&
      (!isEqual(prevColumns, columns) ||
        !isEqual(prevSavedMetrics, savedMetrics))
    ) {
      const matchingMetrics = getMetricsMatchingCurrentDataset(
        propsValue,
        columns as ColumnLike[],
        savedMetrics as savedMetricType[],
      );
      if (!isEqual(matchingMetrics, propsValue)) {
        handleChange(matchingMetrics);
      }
    }
  }, [columns, handleChange, savedMetrics]);

  useEffect(() => {
    setValue(coerceAdhocMetrics(propsValue));
  }, [propsValue]);

  const onDropLabel = useCallback(
    () => handleChange(value),
    [handleChange, value],
  );

  const valueRenderer = useCallback(
    (option: unknown, index: number) => (
      <MetricDefinitionValue
        key={index}
        index={index}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        option={option as any}
        onMetricEdit={onMetricEdit}
        onRemoveMetric={onRemoveMetric}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        datasource={datasource as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        savedMetrics={savedMetrics as any}
        savedMetricsOptions={getOptionsForSavedMetrics(
          savedMetrics as savedMetricType[],
          value,
          value?.[index],
        )}
        onMoveLabel={moveLabel}
        onDropLabel={onDropLabel}
        multi={multi}
      />
    ),
    [
      columns,
      datasource,
      moveLabel,
      multi,
      onDropLabel,
      onMetricEdit,
      onRemoveMetric,
      savedMetrics,
      value,
    ],
  );

  return (
    <div className="metrics-select">
      <HeaderContainer>
        <ControlHeader {...props} />
        {addNewMetricPopoverTrigger(
          <AddIconButton
            disabled={isAddNewMetricDisabled()}
            data-test="add-metric-button"
          >
            <Icons.PlusOutlined iconSize="m" />
          </AddIconButton>,
        )}
      </HeaderContainer>
      <LabelsContainer>
        {value.length > 0
          ? value.map((value, index) => valueRenderer(value, index))
          : addNewMetricPopoverTrigger(
              <AddControlLabel>
                <Icons.PlusOutlined iconSize="m" />
                {t('Add metric')}
              </AddControlLabel>,
            )}
      </LabelsContainer>
    </div>
  );
};

// Was a PureComponent before the FC conversion; preserve shallow-equal skip.
export default memo(MetricsControl);
