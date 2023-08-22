// libs/auth relies on this variable, which is guaranteed to be set on all production machines
process.env['VX_MACHINE_TYPE'] = 'admin';

export {};
