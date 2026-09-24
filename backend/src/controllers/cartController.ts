import { IDEMPOTENCY_KEY_HEADER } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { requireStudentId } from '../middleware/requireAuth.js';
import type { CartService } from '../services/cartService.js';
import type { SubmitService } from '../services/submitService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idempotencyKeySchema, saveCartSchema, submitSchema } from '../validation/cartSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface CartController {
  getCart: RequestHandler;
  saveCart: RequestHandler;
  submit: RequestHandler;
  getStatus: RequestHandler;
}

export interface CartControllerServices {
  cartService: CartService;
  submitService: SubmitService;
}

export function createCartController({
  cartService,
  submitService,
}: CartControllerServices): CartController {
  return {
    async getCart(req, res) {
      // The cart is always the caller's own: no id is read from the request.
      sendSuccess(res, await cartService.getCart(requireStudentId(req)));
    },

    async saveCart(req, res) {
      const { courseCodes } = parseInput(saveCartSchema, req.body);
      const cart = await cartService.saveCart(requireStudentId(req), courseCodes);
      sendSuccess(res, cart, { message: 'Draft saved.' });
    },

    async submit(req, res) {
      const key = parseInput(idempotencyKeySchema, req.get(IDEMPOTENCY_KEY_HEADER));
      const { courseCodes } = parseInput(submitSchema, req.body);
      const receipt = await submitService.submit(requireStudentId(req), key, courseCodes);
      sendSuccess(res, receipt, {
        message: `Your ${receipt.items.length} preferences are submitted.`,
      });
    },

    async getStatus(req, res) {
      sendSuccess(res, await submitService.getStatus(requireStudentId(req)));
    },
  };
}
