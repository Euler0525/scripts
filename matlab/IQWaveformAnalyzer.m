function IQWaveformAnalyzer
app = struct();
app.filePath = '';
app.matData = struct();
app.currentData = [];
app.dataMode = '';
app.csvHeaders = {};
app.csvRadixes = {};
variablePlaceholderText = 'MAT variable';
signalPlaceholderText = 'Import a file first';
iColor = [0.0000 0.4470 0.7410];
qColor = [0.8500 0.3250 0.0980];
spectrumColor = [0.4940 0.1840 0.5560];
markerColor = [0.4500 0.4500 0.4500];
channelPowerColor = [0.0000 0.6000 0.7000];

app.fig = uifigure( ...
    'Name', 'I/Q Waveform Analyzer', ...
    'Position', [100 100 1100 720]);

root = uigridlayout(app.fig, [3 1]);
root.RowHeight = {128, '1x', 52};
root.ColumnWidth = {'1x'};
root.Padding = [12 12 12 10];
root.RowSpacing = 10;

toolbar = uigridlayout(root, [3 10]);
toolbar.Layout.Row = 1;
toolbar.ColumnWidth = {110, '1x', 90, 120, 60, 90, 70, 70, 105, 90};
toolbar.RowHeight = {32, 32, 32};
toolbar.ColumnSpacing = 8;
toolbar.RowSpacing = 6;

app.loadButton = uibutton(toolbar, ...
    'Text', 'Import file', ...
    'ButtonPushedFcn', @onLoadFile);
app.loadButton.Layout.Row = 1;
app.loadButton.Layout.Column = 1;

app.variableDropDown = uidropdown(toolbar, ...
    'Items', {variablePlaceholderText}, ...
    'Value', variablePlaceholderText, ...
    'Enable', 'off', ...
    'ValueChangedFcn', @onVariableChanged);
app.variableDropDown.Layout.Row = 1;
app.variableDropDown.Layout.Column = 2;

fsLabel = uilabel(toolbar, ...
    'Text', 'Sample Fs', ...
    'HorizontalAlignment', 'right');
fsLabel.Layout.Row = 1;
fsLabel.Layout.Column = 3;

app.fsField = uieditfield(toolbar, 'numeric', ...
    'Value', 1, ...
    'Limits', [eps Inf], ...
    'ValueDisplayFormat', '%.12g', ...
    'ValueChangedFcn', @onPlotRequest);
app.fsField.Layout.Row = 1;
app.fsField.Layout.Column = 4;

unitLabel = uilabel(toolbar, ...
    'Text', 'Unit', ...
    'HorizontalAlignment', 'right');
unitLabel.Layout.Row = 1;
unitLabel.Layout.Column = 5;

app.unitDropDown = uidropdown(toolbar, ...
    'Items', {'Hz', 'kHz', 'MHz', 'GHz'}, ...
    'Value', 'Hz', ...
    'ValueChangedFcn', @onPlotRequest);
app.unitDropDown.Layout.Row = 1;
app.unitDropDown.Layout.Column = 6;

app.showICheckBox = uicheckbox(toolbar, ...
    'Text', 'Show I', ...
    'Value', true, ...
    'ValueChangedFcn', @onPlotRequest);
app.showICheckBox.Layout.Row = 1;
app.showICheckBox.Layout.Column = 7;

app.showQCheckBox = uicheckbox(toolbar, ...
    'Text', 'Show Q', ...
    'Value', true, ...
    'ValueChangedFcn', @onPlotRequest);
app.showQCheckBox.Layout.Row = 1;
app.showQCheckBox.Layout.Column = 8;

app.dbCheckBox = uicheckbox(toolbar, ...
    'Text', 'Spectrum dB', ...
    'Value', true, ...
    'ValueChangedFcn', @onPlotRequest);
app.dbCheckBox.Layout.Row = 1;
app.dbCheckBox.Layout.Column = 9;

app.plotButton = uibutton(toolbar, ...
    'Text', 'Replot', ...
    'ButtonPushedFcn', @onPlotRequest);
app.plotButton.Layout.Row = 1;
app.plotButton.Layout.Column = 10;

iSignalLabel = uilabel(toolbar, ...
    'Text', 'I signal', ...
    'HorizontalAlignment', 'right');
iSignalLabel.Layout.Row = 2;
iSignalLabel.Layout.Column = 1;

app.iSignalDropDown = uidropdown(toolbar, ...
    'Items', {signalPlaceholderText}, ...
    'Value', signalPlaceholderText, ...
    'Enable', 'off', ...
    'ValueChangedFcn', @onSignalChanged);
app.iSignalDropDown.Layout.Row = 2;
app.iSignalDropDown.Layout.Column = [2 4];

qSignalLabel = uilabel(toolbar, ...
    'Text', 'Q signal', ...
    'HorizontalAlignment', 'right');
qSignalLabel.Layout.Row = 2;
qSignalLabel.Layout.Column = 5;

app.qSignalDropDown = uidropdown(toolbar, ...
    'Items', {signalPlaceholderText}, ...
    'Value', signalPlaceholderText, ...
    'Enable', 'off', ...
    'ValueChangedFcn', @onSignalChanged);
app.qSignalDropDown.Layout.Row = 2;
app.qSignalDropDown.Layout.Column = [6 10];

app.channelPowerCheckBox = uicheckbox(toolbar, ...
    'Text', 'Channel Power', ...
    'Value', false, ...
    'ValueChangedFcn', @onPlotRequest);
app.channelPowerCheckBox.Layout.Row = 3;
app.channelPowerCheckBox.Layout.Column = 1;

bandwidthLabel = uilabel(toolbar, ...
    'Text', 'IBW', ...
    'HorizontalAlignment', 'right');
bandwidthLabel.Layout.Row = 3;
bandwidthLabel.Layout.Column = 2;

app.integrationBandwidthField = uieditfield(toolbar, 'numeric', ...
    'Value', 1, ...
    'Limits', [eps Inf], ...
    'ValueDisplayFormat', '%.12g', ...
    'ValueChangedFcn', @onPlotRequest);
app.integrationBandwidthField.Layout.Row = 3;
app.integrationBandwidthField.Layout.Column = 3;

app.integrationBandwidthUnitDropDown = uidropdown(toolbar, ...
    'Items', {'Hz', 'kHz', 'MHz', 'GHz'}, ...
    'Value', 'Hz', ...
    'ValueChangedFcn', @onPlotRequest);
app.integrationBandwidthUnitDropDown.Layout.Row = 3;
app.integrationBandwidthUnitDropDown.Layout.Column = 4;

channelPowerHint = uilabel(toolbar, ...
    'HorizontalAlignment', 'left');
channelPowerHint.Layout.Row = 3;
channelPowerHint.Layout.Column = [5 10];

plotGrid = uigridlayout(root, [2 1]);
plotGrid.Layout.Row = 2;
plotGrid.RowHeight = {'1x', '1x'};
plotGrid.ColumnWidth = {'1x'};
plotGrid.RowSpacing = 12;

app.timeAxes = uiaxes(plotGrid);
app.timeAxes.Layout.Row = 1;
title(app.timeAxes, 'Time Domain Waveform');
xlabel(app.timeAxes, 'Time (s)');
ylabel(app.timeAxes, 'Level');
grid(app.timeAxes, 'on');
styleAxes(app.timeAxes);

app.freqAxes = uiaxes(plotGrid);
app.freqAxes.Layout.Row = 2;
title(app.freqAxes, 'Magnitude Frequency Response');
xlabel(app.freqAxes, 'Frequency (Hz)');
ylabel(app.freqAxes, 'Magnitude (dB)');
grid(app.freqAxes, 'on');
styleAxes(app.freqAxes);

bottomGrid = uigridlayout(root, [2 1]);
bottomGrid.Layout.Row = 3;
bottomGrid.RowHeight = {22, 22};
bottomGrid.ColumnWidth = {'1x'};
bottomGrid.Padding = [0 0 0 0];
bottomGrid.RowSpacing = 4;

app.statusLabel = uilabel(bottomGrid, ...
    'Text', 'Import MAT N-by-2 data, or import Vivado ILA CSV and choose I/Q signal columns.');
app.statusLabel.Layout.Row = 1;
app.statusLabel.FontColor = markerColor;

app.powerLabel = uilabel(bottomGrid, ...
    'Text', 'Channel Power: Off');
app.powerLabel.Layout.Row = 2;
app.powerLabel.FontColor = markerColor;

    function onLoadFile(~, ~)
        fileFilter = { ...
            '*.mat;*.csv', 'MAT or CSV files (*.mat, *.csv)'; ...
            '*.mat', 'MAT files (*.mat)'; ...
            '*.csv', 'CSV files (*.csv)'};
        [fileName, folderName] = uigetfile(fileFilter, 'Select I/Q Data File');
        if isequal(fileName, 0)
            return;
        end

        app.filePath = fullfile(folderName, fileName);
        [~, ~, extension] = fileparts(fileName);

        switch lower(extension)
            case '.mat'
                loadMatFile();
            case '.csv'
                loadCsvFile();
            otherwise
                uialert(app.fig, 'Please select a MAT or CSV file.', 'Unsupported File Type');
        end
    end

    function loadMatFile()
        try
            app.matData = load(app.filePath);
        catch err
            uialert(app.fig, err.message, 'File Read Failed');
            return;
        end

        app.dataMode = 'mat';
        app.csvHeaders = {};
        app.csvRadixes = {};

        variableNames = findIqVariables(app.matData);
        if isempty(variableNames)
            app.variableDropDown.Items = {variablePlaceholderText};
            app.variableDropDown.Value = variablePlaceholderText;
            app.variableDropDown.Enable = 'off';
            disableSignalSelectors(signalPlaceholderText, signalPlaceholderText);
            app.currentData = [];
            cla(app.timeAxes);
            cla(app.freqAxes);
            app.statusLabel.Text = 'No real numeric N-by-2 variable was found. Expected format is [I Q].';
            uialert(app.fig, app.statusLabel.Text, 'Invalid Data Format');
            return;
        end

        app.variableDropDown.Items = variableNames;
        app.variableDropDown.Value = variableNames{1};
        app.variableDropDown.Enable = 'on';
        disableSignalSelectors('MAT column 1: I', 'MAT column 2: Q');
        app.currentData = app.matData.(variableNames{1});
        app.statusLabel.Text = ['Imported: ' app.filePath];
        plotCurrentData();
    end

    function loadCsvFile()
        try
            [headers, radixes] = readVivadoCsvHeader(app.filePath);
        catch err
            uialert(app.fig, err.message, 'CSV Read Failed');
            return;
        end

        if numel(headers) < 2
            uialert(app.fig, 'The CSV file must contain a header row, a radix row, and data rows.', 'Invalid CSV Format');
            return;
        end

        app.dataMode = 'csv';
        app.matData = struct();
        app.csvHeaders = headers;
        app.csvRadixes = radixes;
        app.currentData = [];
        app.variableDropDown.Items = {variablePlaceholderText};
        app.variableDropDown.Value = variablePlaceholderText;
        app.variableDropDown.Enable = 'off';

        app.iSignalDropDown.Items = headers;
        app.qSignalDropDown.Items = headers;
        app.iSignalDropDown.Value = headers{chooseInitialSignal(headers, 'i', 1)};
        app.qSignalDropDown.Value = headers{chooseInitialSignal(headers, 'q', min(2, numel(headers)))};
        app.iSignalDropDown.Enable = 'on';
        app.qSignalDropDown.Enable = 'on';
        cla(app.timeAxes);
        cla(app.freqAxes);
        styleAxes(app.timeAxes);
        styleAxes(app.freqAxes);
        app.powerLabel.Text = 'Channel Power: Off';

        app.statusLabel.Text = ['CSV header loaded: ' app.filePath ' | Choose I/Q signals, then click Replot.'];
    end

    function onVariableChanged(~, ~)
        if isempty(app.variableDropDown.Value) || strcmp(app.variableDropDown.Value, variablePlaceholderText)
            return;
        end

        app.currentData = app.matData.(app.variableDropDown.Value);
        plotCurrentData();
    end

    function onSignalChanged(~, ~)
        if ~strcmp(app.dataMode, 'csv')
            return;
        end

        updateCurrentCsvData();
        plotCurrentData();
    end

    function onPlotRequest(~, ~)
        if strcmp(app.dataMode, 'csv')
            updateCurrentCsvData();
        end
        plotCurrentData();
    end

    function disableSignalSelectors(iText, qText)
        app.iSignalDropDown.Items = {iText};
        app.iSignalDropDown.Value = iText;
        app.iSignalDropDown.Enable = 'off';
        app.qSignalDropDown.Items = {qText};
        app.qSignalDropDown.Value = qText;
        app.qSignalDropDown.Enable = 'off';
    end

    function updateCurrentCsvData()
        iIndex = find(strcmp(app.csvHeaders, app.iSignalDropDown.Value), 1);
        qIndex = find(strcmp(app.csvHeaders, app.qSignalDropDown.Value), 1);
        if isempty(iIndex) || isempty(qIndex)
            app.currentData = [];
            return;
        end

        try
            [iRaw, qRaw] = readSelectedCsvSignals(app.filePath, iIndex, qIndex, numel(app.csvHeaders));
            iData = parseCsvSignalColumn(iRaw, app.csvRadixes{iIndex}, app.csvHeaders{iIndex});
            qData = parseCsvSignalColumn(qRaw, app.csvRadixes{qIndex}, app.csvHeaders{qIndex});
        catch err
            app.currentData = [];
            uialert(app.fig, err.message, 'CSV Parse Failed');
            return;
        end

        app.currentData = [iData(:), qData(:)];
    end

    function plotCurrentData()
        if isempty(app.currentData)
            return;
        end

        data = double(app.currentData);
        if size(data, 2) ~= 2
            uialert(app.fig, 'The selected variable is not N-by-2 data.', 'Invalid Data Format');
            return;
        end

        fsHz = app.fsField.Value * unitScale(app.unitDropDown.Value);
        sampleCount = size(data, 1);
        time = (0:sampleCount - 1).' / fsHz;

        iData = data(:, 1);
        qData = data(:, 2);
        iqSignal = iData + 1i * qData;

        plotTimeWaveforms(time, iData, qData);

        spectrum = fftshift(fft(iqSignal)) / sampleCount;
        freq = (-floor(sampleCount / 2):ceil(sampleCount / 2) - 1).' * (fsHz / sampleCount);
        magnitude = abs(spectrum);
        powerSpectrum = magnitude .^ 2;

        if app.dbCheckBox.Value
            plotMagnitude = 20 * log10(magnitude + eps);
            yLabelText = 'Magnitude (dB)';
        else
            plotMagnitude = magnitude;
            yLabelText = 'Magnitude';
        end

        plot(app.freqAxes, freq, plotMagnitude, 'Color', spectrumColor);
        title(app.freqAxes, 'Magnitude Frequency Response');
        xlabel(app.freqAxes, 'Frequency (Hz)');
        ylabel(app.freqAxes, yLabelText);
        grid(app.freqAxes, 'on');
        styleAxes(app.freqAxes);
        app.powerLabel.Text = 'Channel Power: Off';
        channelPower = struct();

        if app.channelPowerCheckBox.Value
            channelPower = calculateChannelPower(freq, powerSpectrum, fsHz);
            drawChannelPowerMarkers(channelPower);
            app.powerLabel.Text = sprintf( ...
                'Channel Power: On | IBW: %.12g Hz | Integrated Power: %.6g (%.3f dB) | PSD: %.6g/Hz (%.3f dB/Hz)', ...
                channelPower.actualBandwidthHz, ...
                channelPower.integratedPower, ...
                10 * log10(channelPower.integratedPower + eps), ...
                channelPower.powerSpectralDensity, ...
                10 * log10(channelPower.powerSpectralDensity + eps));
        end

        if strcmp(app.dataMode, 'csv')
            sourceText = sprintf('I: %s | Q: %s', app.iSignalDropDown.Value, app.qSignalDropDown.Value);
        else
            sourceText = sprintf('Variable: %s', app.variableDropDown.Value);
        end

        exportCurrentSignalsToWorkspace(data, iData, qData, iqSignal, time, freq, spectrum, powerSpectrum, fsHz, channelPower);
        app.statusLabel.Text = sprintf('%s | Samples: %d | Fs: %.12g Hz', sourceText, sampleCount, fsHz);
    end

    function exportCurrentSignalsToWorkspace(data, iData, qData, iqSignal, time, freq, spectrum, powerSpectrum, fsHz, channelPower)
        assignin('base', 'iq_data', data);
        assignin('base', 'i_data', iData);
        assignin('base', 'q_data', qData);
        assignin('base', 'iq_complex', iqSignal);
        assignin('base', 'iq_time', time);
        assignin('base', 'iq_frequency', freq);
        assignin('base', 'iq_spectrum', spectrum);
        assignin('base', 'iq_power_spectrum', powerSpectrum);
        assignin('base', 'iq_sample_rate_hz', fsHz);
        assignin('base', 'iq_channel_power', channelPower);

        sourceInfo = struct( ...
            'filePath', app.filePath, ...
            'mode', app.dataMode);

        if strcmp(app.dataMode, 'csv')
            sourceInfo.iSignal = app.iSignalDropDown.Value;
            sourceInfo.qSignal = app.qSignalDropDown.Value;
            assignin('base', matlab.lang.makeValidName(app.iSignalDropDown.Value), iData);
            assignin('base', matlab.lang.makeValidName(app.qSignalDropDown.Value), qData);
        else
            sourceInfo.matVariable = app.variableDropDown.Value;
            assignin('base', matlab.lang.makeValidName(app.variableDropDown.Value), data);
        end

        assignin('base', 'iq_source_info', sourceInfo);
    end

    function channelPower = calculateChannelPower(freq, powerSpectrum, fsHz)
        requestedBandwidthHz = app.integrationBandwidthField.Value * ...
            unitScale(app.integrationBandwidthUnitDropDown.Value);
        bandwidthHz = min(requestedBandwidthHz, fsHz);
        binMask = abs(freq) <= bandwidthHz / 2;
        if ~any(binMask)
            [~, centerIndex] = min(abs(freq));
            binMask(centerIndex) = true;
        end

        frequencyStepHz = fsHz / numel(freq);
        actualBandwidthHz = max(frequencyStepHz, sum(binMask) * frequencyStepHz);
        integratedPower = sum(powerSpectrum(binMask));
        powerSpectralDensity = integratedPower / actualBandwidthHz;

        channelPower = struct( ...
            'requestedBandwidthHz', requestedBandwidthHz, ...
            'actualBandwidthHz', actualBandwidthHz, ...
            'lowerFrequencyHz', -bandwidthHz / 2, ...
            'upperFrequencyHz', bandwidthHz / 2, ...
            'integratedPower', integratedPower, ...
            'powerSpectralDensity', powerSpectralDensity);
    end

    function drawChannelPowerMarkers(channelPower)
        lowerLine = xline(app.freqAxes, channelPower.lowerFrequencyHz, '--', '');
        upperLine = xline(app.freqAxes, channelPower.upperFrequencyHz, '--', '');
        centerLine = xline(app.freqAxes, 0, ':', '');
        lowerLine.Color = channelPowerColor;
        upperLine.Color = channelPowerColor;
        centerLine.Color = markerColor;
    end

    function plotTimeWaveforms(time, iData, qData)
        cla(app.timeAxes);
        hold(app.timeAxes, 'on');
        legendLabels = {};

        if app.showICheckBox.Value
            plot(app.timeAxes, time, iData, 'Color', iColor);
            legendLabels{end + 1} = 'I channel';
        end

        if app.showQCheckBox.Value
            plot(app.timeAxes, time, qData, 'Color', qColor);
            legendLabels{end + 1} = 'Q channel';
        end

        hold(app.timeAxes, 'off');
        title(app.timeAxes, 'Time Domain Waveform');
        xlabel(app.timeAxes, 'Time (s)');
        ylabel(app.timeAxes, 'Level');
        if isempty(legendLabels)
            legend(app.timeAxes, 'off');
        else
            legendObject = legend(app.timeAxes, legendLabels, 'Location', 'best');
            legendObject.TextColor = markerColor;
            legendObject.EdgeColor = markerColor;
        end
        grid(app.timeAxes, 'on');
        styleAxes(app.timeAxes);
    end

    function styleAxes(axesHandle)
        axesHandle.XColor = markerColor;
        axesHandle.YColor = markerColor;
        axesHandle.GridColor = [0.6500 0.6500 0.6500];
        axesHandle.MinorGridColor = [0.8000 0.8000 0.8000];
        axesHandle.Title.Color = markerColor;
        axesHandle.XLabel.Color = markerColor;
        axesHandle.YLabel.Color = markerColor;
    end
end

function names = findIqVariables(matData)
allNames = fieldnames(matData);
isIq = false(size(allNames));

for index = 1:numel(allNames)
    value = matData.(allNames{index});
    isIq(index) = isnumeric(value) && isreal(value) && ismatrix(value) && size(value, 2) == 2;
end

names = allNames(isIq);
end

function [headers, radixes] = readVivadoCsvHeader(filePath)
fileId = fopen(filePath, 'r');
if fileId < 0
    error('Unable to open CSV file: %s', filePath);
end
cleanup = onCleanup(@() fclose(fileId));

headerLine = fgetl(fileId);
radixLine = fgetl(fileId);
if ~ischar(headerLine) || ~ischar(radixLine)
    error('CSV file must contain a header row and a radix row.');
end

headers = strtrim(strsplit(headerLine, ','));
radixes = strtrim(strsplit(radixLine, ','));
if ~isempty(radixes)
    radixes{1} = regexprep(radixes{1}, '^Radix\s*-\s*', '', 'ignorecase');
end

if numel(radixes) < numel(headers)
    radixes(end + 1:numel(headers)) = {''};
elseif numel(radixes) > numel(headers)
    radixes = radixes(1:numel(headers));
end

for index = 1:numel(headers)
    if isempty(headers{index})
        headers{index} = sprintf('Column %d', index);
    end
end
end

function [iRaw, qRaw] = readSelectedCsvSignals(filePath, iIndex, qIndex, columnCount)
fileId = fopen(filePath, 'r');
if fileId < 0
    error('Unable to open CSV file: %s', filePath);
end
cleanup = onCleanup(@() fclose(fileId));

formatParts = repmat({'%*s'}, 1, columnCount);
formatParts{iIndex} = '%s';
formatParts{qIndex} = '%s';
selectedColumns = find(strcmp(formatParts, '%s'));

data = textscan(fileId, strjoin(formatParts, ''), ...
    'Delimiter', ',', ...
    'HeaderLines', 2, ...
    'ReturnOnError', false);
if isempty(data)
    error('No data rows were found in the CSV file.');
end

columnData = cell(1, columnCount);
for index = 1:numel(selectedColumns)
    columnData{selectedColumns(index)} = data{index};
end

iRaw = columnData{iIndex};
qRaw = columnData{qIndex};
end

function index = chooseInitialSignal(headers, channelName, fallbackIndex)
target = ['_' lower(channelName) '['];
for candidate = 1:numel(headers)
    headerText = lower(headers{candidate});
    if contains(headerText, target)
        index = candidate;
        return;
    end
end

target = ['_' lower(channelName)];
for candidate = 1:numel(headers)
    headerText = lower(headers{candidate});
    if endsWith(headerText, target) || contains(headerText, [target '_'])
        index = candidate;
        return;
    end
end

index = min(max(1, fallbackIndex), numel(headers));
end

function values = parseCsvSignalColumn(rawColumn, radixText, headerText)
radixText = upper(strtrim(radixText));
headerBitWidth = parseSignalBitWidth(headerText);
textValues = strtrim(string(rawColumn(:)));
values = NaN(numel(textValues), 1);
validMask = textValues ~= "";

if contains(radixText, 'HEX')
    values(validMask) = parseSignedHexVector(textValues(validMask), headerBitWidth);
else
    numericValues = str2double(textValues(validMask));
    if any(isnan(numericValues))
        badIndex = find(isnan(numericValues), 1);
        badValues = textValues(validMask);
        error('Column "%s" contains a nonnumeric value: %s', headerText, badValues(badIndex));
    end
    values(validMask) = numericValues;
end
end

function values = parseSignedHexVector(hexText, headerBitWidth)
hexText = regexprep(strtrim(hexText), '^0x', '', 'ignorecase');
values = NaN(numel(hexText), 1);
negativeMask = startsWith(hexText, '-');
if any(negativeMask)
    values(negativeMask) = str2double(hexText(negativeMask));
end

positiveText = hexText(~negativeMask);
if isempty(positiveText)
    return;
end

unsignedValues = hex2dec(char(positiveText));
if isnan(headerBitWidth)
    bitWidth = max(1, 4 * max(strlength(positiveText)));
else
    bitWidth = headerBitWidth;
end

signLimit = 2^(bitWidth - 1);
fullScale = 2^bitWidth;
signedValues = unsignedValues;
signedValues(unsignedValues >= signLimit) = unsignedValues(unsignedValues >= signLimit) - fullScale;
values(~negativeMask) = signedValues;
end

function bitWidth = parseSignalBitWidth(headerText)
tokens = regexp(headerText, '\[(\d+):(\d+)\]', 'tokens', 'once');
if isempty(tokens)
    bitWidth = NaN;
    return;
end

leftIndex = str2double(tokens{1});
rightIndex = str2double(tokens{2});
bitWidth = abs(leftIndex - rightIndex) + 1;
end

function scale = unitScale(unitText)
switch unitText
    case 'Hz'
        scale = 1;
    case 'kHz'
        scale = 1e3;
    case 'MHz'
        scale = 1e6;
    case 'GHz'
        scale = 1e9;
    otherwise
        scale = 1;
end
end
