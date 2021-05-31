import { createContext } from './create-context';
import { Request, Response, Router } from 'express';
import { clientMetricsSchema } from './metrics-schema';
import { IProxyConfig, Logger } from './config';
import { IClient } from './client';
import { Context } from 'unleash-client';

const NOT_READY = 'Unleash Proxy has not connected to unleash-api and is not ready to accept requests yet.';

export default class UnleashProxy {
    private logger: Logger;
    private proxySecrets: string[];
    private client: IClient;
    private ready: boolean = false;
    public middleware: Router;

    constructor(client: IClient, config: IProxyConfig) {
        this.logger = config.logger;
        this.proxySecrets = config.proxySecrets;
        this.client = client;

        this.client.on('ready', () => this.ready = true);

        const router = Router();
        this.middleware = router;
        
        //Routes
        router.get('/health', this.health.bind(this));
        router.get('/', this.getEnabledToggles.bind(this));
        router.post('/', this.lookupToggles.bind(this));
        router.post('/client/metrics', this.registerMetrics.bind(this));
    }

    setProxySecrets(proxySecrets: string[]): void {
        this.proxySecrets = proxySecrets;
    }

    getEnabledToggles(req: Request<{}, {}, {}, Context>, res: Response): void {
        const apiToken = req.header('authorization');

        if(!this.ready) {
            res.status(503).send(NOT_READY);
            return;
        } else if (!apiToken || !this.proxySecrets.includes(apiToken)) {
            res.sendStatus(401);
        } else {
            const context = createContext(req);
            const toggles = this.client.getEnabledToggles(context);
            res.send({ toggles });
        }
    }

    lookupToggles(req: Request, res: Response): void {
        const apiToken = req.header('authorization');

        if(!this.ready) {
            res.status(503).send(NOT_READY);
            return;
        } else if (!apiToken || !this.proxySecrets.includes(apiToken)) {
            res.sendStatus(401);
        } else {
            const toggleNames = req.body.toggles;
            const context = req.body.context;

            const toggles = this.client.getDefinedToggles(toggleNames, context);
            res.send(toggles);
        }
    }

    health(req: Request, res: Response): void {
        if(!this.ready) {
            res.status(503).send(NOT_READY);
            return;
        } else {
            res.send('ok');
        }
    }

    registerMetrics(req: Request, res: Response): void {
        const data = req.body;

        const { error, value } = clientMetricsSchema.validate(data);

        if (error) {
            this.logger.warn('Invalid metrics posted', error);
            res.status(400).json(error);
            return;
        }

        this.client.registerMetrics(value);
        res.sendStatus(200);
    }
};