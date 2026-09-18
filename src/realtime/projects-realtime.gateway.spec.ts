import { UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { ProjectsRealtimeGateway } from './projects-realtime.gateway';

describe('ProjectsRealtimeGateway', () => {
  const user = {
    id: 'u1',
    email: 'u@test.com',
    roles: [RoleName.INVESTIGADOR],
  };

  it('disconnects when handshake auth fails', async () => {
    const disconnect = jest.fn();
    const client = { id: 's1', disconnect, data: {} };

    const wsAuth = {
      authenticateSocket: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Missing token')),
    };
    const access = { assertCanAccessProject: jest.fn() };
    const gateway = new ProjectsRealtimeGateway(
      wsAuth as never,
      access as never,
    );

    await gateway.handleConnection(client as never);
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('joins room after membership check', async () => {
    const join = jest.fn().mockResolvedValue(undefined);
    const emit = jest.fn();
    const client = { id: 's1', join, emit, data: { user } };
    const wsAuth = {
      getUser: jest.fn().mockReturnValue(user),
      authenticateSocket: jest.fn(),
    };
    const access = {
      assertCanAccessProject: jest.fn().mockResolvedValue({ id: 'p1' }),
    };
    const gateway = new ProjectsRealtimeGateway(
      wsAuth as never,
      access as never,
    );

    const result = await gateway.handleJoin(client as never, {
      projectId: '11111111-1111-4111-8111-111111111111',
    });

    expect(access.assertCanAccessProject).toHaveBeenCalledWith(
      user,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(join).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(emit).toHaveBeenCalledWith('joined', {
      room: '11111111-1111-4111-8111-111111111111',
    });
    expect(result).toEqual({
      ok: true,
      room: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('denies join without membership', async () => {
    const client = {
      id: 's1',
      join: jest.fn(),
      emit: jest.fn(),
      data: { user },
    };
    const wsAuth = {
      getUser: jest.fn().mockReturnValue(user),
    };
    const access = {
      assertCanAccessProject: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('No access')),
    };
    const gateway = new ProjectsRealtimeGateway(
      wsAuth as never,
      access as never,
    );

    const result = await gateway.handleJoin(client as never, {
      projectId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.ok).toBe(false);
    expect(client.join).not.toHaveBeenCalled();
  });
});
