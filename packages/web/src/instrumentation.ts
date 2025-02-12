import {diag, DiagConsoleLogger, DiagLogLevel} from '@opentelemetry/api';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {Resource} from '@opentelemetry/resources';
import {
	AlwaysOnSampler,
	BasicTracerProvider,
	SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {ATTR_SERVICE_NAME} from '@opentelemetry/semantic-conventions';

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const exporter = new OTLPTraceExporter({
	url: 'http://127.0.0.1:4318/v1/traces',
});
const provider = new BasicTracerProvider({
	resource: new Resource({
		[ATTR_SERVICE_NAME]: 'web',
	}),
	// spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter())],
	spanProcessors: [new SimpleSpanProcessor(exporter)],
	// spanProcessors: [new SimpleSpanProcessor(exporter)],
	sampler: new AlwaysOnSampler(),
});
provider.register();
